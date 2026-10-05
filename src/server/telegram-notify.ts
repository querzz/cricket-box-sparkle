import { requireBotToken } from "@/server/config";

function escapeHtml(text:string){return text.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");}

export async function sendTelegramNotification(telegramId:string,text:string){
  try{
    const token=requireBotToken();
    const response=await fetch(`https://api.telegram.org/bot${token}/sendMessage`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({chat_id:telegramId,text:escapeHtml(text),parse_mode:"HTML"}),signal:AbortSignal.timeout(10000)});
    if(!response.ok) throw new Error(`HTTP_${response.status}`);
    const payload=await response.json() as {ok?:boolean;description?:string};
    if(payload.ok!==true) throw new Error(payload.description??"TELEGRAM_SEND_FAILED");
    return true;
  }catch(error){
    console.warn("[CRICKET BOX] Telegram notification failed:",error instanceof Error?error.message:error);
    return false;
  }
}