import { Check, Clipboard } from "lucide-react";
import { useEffect, useRef, useState } from "react";

async function copyToClipboard(value:string){
  try{
    if(navigator.clipboard?.writeText){
      await navigator.clipboard.writeText(value);
      return true;
    }
  }catch{}
  try{
    const textarea=document.createElement("textarea");
    textarea.value=value;
    textarea.style.position="fixed";
    textarea.style.opacity="0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const copied=document.execCommand("copy");
    textarea.remove();
    return copied;
  }catch{
    return false;
  }
}

export function CopyButton({value,label="Скопировать",className=""}:{value:string;label?:string;className?:string}){
  const [copied,setCopied]=useState(false);
  const timer=useRef<number|null>(null);
  useEffect(()=>()=>{if(timer.current!==null)window.clearTimeout(timer.current);},[]);
  async function handleCopy(){
    const ok=await copyToClipboard(value);
    if(!ok)return;
    setCopied(true);
    if(timer.current!==null)window.clearTimeout(timer.current);
    timer.current=window.setTimeout(()=>setCopied(false),1500);
  }
  return <button type="button" aria-label={copied?"Скопировано":label} title={copied?"Скопировано":label} onClick={(event)=>{event.stopPropagation();void handleCopy();}} className={`inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-muted-foreground transition-colors hover:bg-muted/20 ${className}`}>
    {copied?<><Check className="size-3.5 text-primary-glow"/><span className="text-[9px] font-semibold text-primary-glow">Скопировано</span></>:<Clipboard className="size-3.5"/>}
  </button>;
}
