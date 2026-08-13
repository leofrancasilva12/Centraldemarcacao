// @ts-nocheck — manipulação de DOM genérica (getElementById/querySelector
// retornam Element/HTMLElement sem narrowing); só a camada de dados
// (js/editor/types.js, fields.js, geometry.js, storage.js) é checada.
// Diálogo modal temático (confirmação / prompt de texto), usado no lugar de
// window.confirm/prompt para manter a UI consistente com o app.
export function createDialogs(){
  const appDialog = document.getElementById("appDialog");
  const dialogCard = appDialog.querySelector(".dialog-card");
  const dialogTitle = document.getElementById("dialogTitle");
  const dialogMessage = document.getElementById("dialogMessage");
  const dialogIcon = document.getElementById("dialogIcon");
  const dialogBody = document.getElementById("dialogBody");
  const dialogCancel = document.getElementById("dialogCancel");
  const dialogConfirm = document.getElementById("dialogConfirm");
  let dialogResolver = null;

  function closeAppDialog(value){
    if(!appDialog.classList.contains("open")) return;
    appDialog.classList.remove("open");
    appDialog.setAttribute("aria-hidden", "true");
    const resolve = dialogResolver;
    dialogResolver = null;
    setTimeout(() => { dialogBody.innerHTML = ""; if(resolve) resolve(value); }, 120);
  }

  function openAppDialog(opts){
    const o = Object.assign({
      title:"Confirmar", message:"", icon:"?", danger:false, input:false,
      inputValue:"", placeholder:"", confirmText:"Confirmar", cancelText:"Cancelar"
    }, opts || {});

    if(dialogResolver) closeAppDialog(false);
    dialogTitle.textContent = o.title;
    dialogMessage.textContent = o.message;
    dialogMessage.style.display = o.message ? "block" : "none";
    dialogIcon.textContent = o.icon;
    dialogIcon.classList.toggle("danger", !!o.danger);
    dialogCancel.textContent = o.cancelText;
    dialogConfirm.textContent = o.confirmText;
    dialogConfirm.className = o.danger ? "btn confirm-danger" : "btn primary";
    dialogBody.innerHTML = "";

    let input = null;
    if(o.input){
      input = document.createElement("input");
      input.type = "text";
      input.className = "dialog-input";
      input.value = o.inputValue || "";
      input.placeholder = o.placeholder || "";
      input.autocomplete = "off";
      dialogBody.appendChild(input);
    }

    appDialog.classList.add("open");
    appDialog.setAttribute("aria-hidden", "false");

    requestAnimationFrame(() => {
      if(input){ input.focus(); input.select(); }
      else dialogConfirm.focus();
    });

    return new Promise(resolve => {
      dialogResolver = resolve;
      dialogCancel.onclick = () => closeAppDialog(o.input ? null : false);
      dialogConfirm.onclick = () => {
        if(input){
          const value = input.value.trim();
          if(!value){ input.focus(); return; }
          closeAppDialog(value);
        } else closeAppDialog(true);
      };
      appDialog.onclick = e => { if(e.target === appDialog) closeAppDialog(o.input ? null : false); };
      dialogCard.onclick = e => e.stopPropagation();
      appDialog.onkeydown = e => {
        if(e.key === "Escape"){ e.preventDefault(); closeAppDialog(o.input ? null : false); }
        if(e.key === "Enter" && input && document.activeElement === input){
          e.preventDefault(); dialogConfirm.click();
        }
      };
    });
  }

  function askConfirm(message, options){
    return openAppDialog(Object.assign({title:"Confirmar ação", message, icon:"?"}, options || {}));
  }
  function askText(message, options){
    return openAppDialog(Object.assign({title:"Salvar modelo", message, icon:"✎", input:true}, options || {}));
  }

  return { openAppDialog, closeAppDialog, askConfirm, askText };
}
