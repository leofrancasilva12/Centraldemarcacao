// Notificação toast temporária no rodapé.
export function createToast(){
  let toastTimer = null;
  function showToast(msg){
    const t = document.getElementById("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 2400);
  }
  return { showToast };
}
