import { createFileRoute } from "@tanstack/react-router";

import { authenticateAdmin } from "@/server/auth/access";
import { query, withTransaction } from "@/server/db";

type Body = { initData?: unknown; telegramId?: unknown; role?: unknown; username?: unknown; action?: unknown };
type AdminRow = { id:string; telegram_id:string; username:string|null; role:"OWNER"|"ADMIN"; is_active:boolean; created_at:string; updated_at:string; user_id:string|null; first_name:string|null; last_name:string|null; user_username:string|null };
function jsonError(code:string,status:number){return Response.json({ok:false,code},{status});}

export const Route = createFileRoute("/api/admin/access")({server:{handlers:{
  GET:async({request})=>{try{
    const url=new URL(request.url);await authenticateAdmin(url.searchParams.get("initData")??"");
    const result=await query<AdminRow>(`SELECT a.id::text,a.telegram_id::text,a.username,a.role,a.is_active,a.created_at::text,a.updated_at::text,
      u.id::text AS user_id,u.first_name,u.last_name,u.username AS user_username
      FROM admins a LEFT JOIN users u ON u.telegram_id=a.telegram_id AND u.is_test=FALSE
      WHERE a.is_test=FALSE
      ORDER BY CASE WHEN a.role='OWNER' THEN 0 ELSE 1 END,a.created_at ASC`);
    return Response.json({ok:true,admins:result.rows.map(r=>({id:r.id,telegram_id:r.telegram_id,username:r.username,userId:r.user_id,firstName:r.first_name,lastName:r.last_name,userUsername:r.user_username,role:r.role,is_active:r.is_active,created_at:r.created_at,updated_at:r.updated_at}))});
  }catch(error){const code=error instanceof Error?error.message:"AUTH_FAILED";return jsonError(code==="ADMIN_ACCESS_DENIED"?code:"AUTH_FAILED",401);}},
  POST:async({request})=>{try{
    const body=await request.json() as Body;const actor=await authenticateAdmin(String(body.initData??""));if(actor.role!=="OWNER")return jsonError("OWNER_ONLY",403);
    const telegramId=String(body.telegramId??"").trim();if(!/^\d+$/.test(telegramId))return jsonError("INVALID_TELEGRAM_ID",400);
    if(body.action==="TRANSFER_OWNER"){
      if(telegramId===String(actor.telegramId))return jsonError("CANNOT_TRANSFER_TO_SELF",400);
      await withTransaction(async(client)=>{
        const target=await client.query<{id:string;role:"OWNER"|"ADMIN";is_active:boolean}>(`SELECT id::text,role,is_active FROM admins WHERE telegram_id=$1 AND is_test=FALSE FOR UPDATE`,[telegramId]);
        const targetRow=target.rows[0];if(!targetRow)throw new Error("ADMIN_NOT_FOUND");if(!targetRow.is_active)throw new Error("ADMIN_INACTIVE");if(targetRow.role!=="ADMIN")throw new Error("OWNER_TRANSFER_TARGET_INVALID");
        const currentOwner=await client.query<{id:string}>(`SELECT id::text FROM admins WHERE telegram_id=$1 AND role='OWNER' AND is_active=TRUE AND is_test=FALSE FOR UPDATE`,[actor.telegramId]);if(!currentOwner.rows[0])throw new Error("OWNER_NOT_FOUND");
        await client.query(`UPDATE admins SET role='ADMIN',updated_at=now() WHERE id=$1::uuid`,[currentOwner.rows[0].id]);await client.query(`UPDATE admins SET role='OWNER',updated_at=now() WHERE id=$1::uuid`,[targetRow.id]);
        await client.query(`INSERT INTO audit_logs(admin_id,action,entity_type,entity_id,after_data) VALUES($1::uuid,'OWNER_TRANSFER','admin',$2,$3::jsonb)`,[currentOwner.rows[0].id,targetRow.id,JSON.stringify({previousOwnerTelegramId:actor.telegramId,newOwnerTelegramId:Number(telegramId)})]);
      });return Response.json({ok:true});
    }
    const role=body.role==="OWNER"?"OWNER":"ADMIN";if(role==="OWNER")return jsonError("OWNER_TRANSFER_REQUIRED",400);
    const username=typeof body.username==="string"&&body.username.trim()?body.username.trim():null;
    await withTransaction(async(client)=>{
      const before=await client.query<{id:string;telegram_id:string;username:string|null;role:"OWNER"|"ADMIN";is_active:boolean}>(`SELECT id::text,telegram_id::text,username,role,is_active FROM admins WHERE telegram_id=$1 AND is_test=FALSE FOR UPDATE`,[telegramId]);
      const existing=before.rows[0];
      if(existing?.role==="OWNER") throw new Error("OWNER_CANNOT_BE_REPLACED");
      let adminId:string;
      if(existing){
        await client.query(`UPDATE admins SET username=$2,role='ADMIN',is_active=TRUE,is_test=FALSE,updated_at=now() WHERE id=$1::uuid`,[existing.id,username]);
        adminId=existing.id;
      }else{
        const inserted=await client.query<{id:string}>(`INSERT INTO admins(telegram_id,username,role,is_active,is_test) VALUES($1,$2,'ADMIN',TRUE,FALSE) RETURNING id::text`,[telegramId,username]);
        adminId=inserted.rows[0].id;
      }
      await client.query(`INSERT INTO audit_logs(admin_id,action,entity_type,entity_id,before_data,after_data) VALUES($1::uuid,$2,'admin',$3,$4::jsonb,$5::jsonb)`,[actor.id,existing?"ADMIN_REACTIVATED":"ADMIN_ADDED",adminId,JSON.stringify(existing??null),JSON.stringify({telegramId,username,role:"ADMIN",is_active:true})]);
    });
    return Response.json({ok:true});
  }catch(error){const code=error instanceof Error?error.message:"AUTH_FAILED";const status=["OWNER_ONLY"].includes(code)?403:["ADMIN_NOT_FOUND"].includes(code)?404:["OWNER_CANNOT_BE_REPLACED"].includes(code)?409:400;return jsonError(code,status);}},
  PATCH:async({request})=>{try{
    const body=await request.json() as Body;const actor=await authenticateAdmin(String(body.initData??""));if(actor.role!=="OWNER")return jsonError("OWNER_ONLY",403);
    const telegramId=String(body.telegramId??"").trim();const active=body.role!=="REVOKE";if(!/^\d+$/.test(telegramId))return jsonError("INVALID_TELEGRAM_ID",400);if(telegramId===String(actor.telegramId))return jsonError("CANNOT_CHANGE_SELF",400);if(body.role==="OWNER")return jsonError("OWNER_TRANSFER_REQUIRED",400);
    await withTransaction(async(client)=>{
      const before=await client.query<{id:string;telegram_id:string;username:string|null;role:"OWNER"|"ADMIN";is_active:boolean}>(`SELECT id::text,telegram_id::text,username,role,is_active FROM admins WHERE telegram_id=$1 AND is_test=FALSE FOR UPDATE`,[telegramId]);
      const row=before.rows[0];if(!row)throw new Error("ADMIN_NOT_FOUND");if(row.role!=="ADMIN")throw new Error("OWNER_ONLY");
      if(row.is_active===active)return;
      await client.query(`UPDATE admins SET is_active=$2,updated_at=now() WHERE id=$1::uuid`,[row.id,active]);
      await client.query(`INSERT INTO audit_logs(admin_id,action,entity_type,entity_id,before_data,after_data) VALUES($1::uuid,$2,'admin',$3,$4::jsonb,$5::jsonb)`,[actor.id,active?"ADMIN_ACTIVATED":"ADMIN_REVOKED",row.id,JSON.stringify(row),JSON.stringify({...row,is_active:active})]);
    });
    return Response.json({ok:true});
  }catch(error){const code=error instanceof Error?error.message:"REQUEST_FAILED";const status=code==="OWNER_ONLY"?403:code==="ADMIN_NOT_FOUND"?404:400;return jsonError(code,status);}},
  DELETE:async({request})=>{try{
    const body=await request.json() as Body;const actor=await authenticateAdmin(String(body.initData??""));if(actor.role!=="OWNER")return jsonError("OWNER_ONLY",403);
    const telegramId=String(body.telegramId??"").trim();if(!/^\d+$/.test(telegramId))return jsonError("INVALID_TELEGRAM_ID",400);if(telegramId===String(actor.telegramId))return jsonError("CANNOT_REMOVE_SELF",400);
    await withTransaction(async(client)=>{
      const before=await client.query<{id:string;telegram_id:string;username:string|null;role:"OWNER"|"ADMIN";is_active:boolean}>(`SELECT id::text,telegram_id::text,username,role,is_active FROM admins WHERE telegram_id=$1 AND is_test=FALSE FOR UPDATE`,[telegramId]);
      const row=before.rows[0];if(!row)throw new Error("ADMIN_NOT_FOUND");if(row.role!=="ADMIN")throw new Error("OWNER_ONLY");
      await client.query(`DELETE FROM admins WHERE id=$1::uuid`,[row.id]);
      await client.query(`INSERT INTO audit_logs(admin_id,action,entity_type,entity_id,before_data,after_data) VALUES($1::uuid,'ADMIN_REMOVED','admin',$2,$3::jsonb,NULL)`,[actor.id,row.id,JSON.stringify(row)]);
    });
    return Response.json({ok:true});
  }catch(error){const code=error instanceof Error?error.message:"REQUEST_FAILED";const status=["OWNER_ONLY"].includes(code)?403:code==="ADMIN_NOT_FOUND"?404:400;return jsonError(code,status);}},
}}});
