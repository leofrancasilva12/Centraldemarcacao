// Avisa quem já está com a aba aberta quando uma nova versão do site é
// publicada. Site estático sem service worker: comparamos um fingerprint do
// próprio index.html (ETag/Last-Modified do servidor, ou um hash do
// conteúdo se nenhum dos dois vier na resposta) a cada checagem periódica.
const CHECK_INTERVAL_MS = 4 * 60 * 1000;

async function fingerprint(){
  const res = await fetch("./index.html", { cache: "no-store" });
  if(!res.ok) return null;
  const etag = res.headers.get("etag");
  const lastModified = res.headers.get("last-modified");
  if(etag) return "etag:" + etag;
  if(lastModified) return "lm:" + lastModified;
  const text = await res.text();
  let hash = 0;
  for(let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) | 0;
  return "hash:" + hash + ":" + text.length;
}

export function initUpdateCheck(){
  if(document.documentElement.classList.contains("maintenance")) return;
  const banner = document.getElementById("updateBanner");
  const reloadBtn = document.getElementById("updateBannerReload");
  const dismissBtn = document.getElementById("updateBannerDismiss");
  if(!banner || !reloadBtn || !dismissBtn) return;

  let baseline = null;
  let dismissed = false;
  let timer = null;

  async function check(){
    if(dismissed) return;
    const current = await fingerprint().catch(() => null);
    if(!current) return;
    if(baseline === null){ baseline = current; return; }
    if(current !== baseline){
      banner.classList.add("show");
      clearInterval(timer);
    }
  }

  reloadBtn.addEventListener("click", () => location.reload());
  dismissBtn.addEventListener("click", () => {
    dismissed = true;
    banner.classList.remove("show");
  });
  document.addEventListener("visibilitychange", () => {
    if(document.visibilityState === "visible") check();
  });

  check();
  timer = setInterval(check, CHECK_INTERVAL_MS);
}
