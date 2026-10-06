import { onLanguage, t } from '../i18n.js';

// LA CUENTA DEL JUGADOR, en el panel del ranking (`ranking-ui.js`): sin cuenta, una línea que dice que el
// progreso se guarda solo en el aparato y el botón de entrar; con cuenta, con quién se ha entrado y el de
// salir; con la cuenta de correo aún sin confirmar, el aviso de que mire su correo y el de volver a mandarlo.
// Entrar abre su ventana: «Continuar con Google» o correo y contraseña (entrar, crear cuenta o recuperar la
// contraseña). `cloud`: la de `net/cloud.js`. Sin Firebase configurado, no se enseña nada.

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function boton(className, text, onClick) {
  const b = el('button', className, text);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

// La «G» de Google, dibujada con sus cuatro colores (la de sus botones de «Continuar con Google»).
const G = '<svg viewBox="0 0 48 48" aria-hidden="true">'
  + '<path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>'
  + '<path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>'
  + '<path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>'
  + '<path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>'
  + '</svg>';

export function createAuthUi({ cloud, area }) {
  if (!cloud?.available || !area) return { refresh() {} };
  area.hidden = false;
  let user = null;
  let aviso = '';

  // LA VENTANA DE ENTRAR.
  const fondo = el('div', 'sala cuenta');
  fondo.hidden = true;
  const caja = el('div', 'sala-caja cuenta-caja');
  caja.setAttribute('role', 'dialog');
  caja.setAttribute('aria-modal', 'true');
  const cabecera = el('div', 'sala-cabecera');
  const titulo = el('h2', 'sala-titulo');
  const cerrar = boton('sala-cerrar', '✕', () => (fondo.hidden = true));
  cabecera.append(titulo, cerrar);
  const google = boton('cuenta-google', '', () => entra(() => cloud.google()));
  const o = el('div', 'cuenta-o');
  const form = el('form', 'cuenta-form');
  form.noValidate = true;
  const campo = (type, autocomplete) => {
    const input = el('input', 'cuenta-campo');
    input.type = type;
    input.autocomplete = autocomplete;
    input.spellcheck = false;
    input.autocapitalize = 'off';
    return input;
  };
  const nombre = campo('text', 'nickname');
  nombre.maxLength = 16;
  nombre.autocapitalize = 'words';
  const correo = campo('email', 'email');
  const clave = campo('password', 'current-password');
  const enviar = el('button', 'final-boton principal cuenta-enviar');
  enviar.type = 'submit';
  const cambia = boton('cuenta-enlace', '', () => {
    creando = !creando;
    aviso = '';
    pintaVentana();
  });
  const olvido = boton('cuenta-enlace', '', () => entra(() => cloud.resetPassword(correo.value.trim()), 'cuenta.recupera'));
  const mensaje = el('p', 'cuenta-mensaje');
  mensaje.setAttribute('role', 'status');
  form.append(nombre, correo, clave, enviar);
  caja.append(cabecera, google, o, form, cambia, olvido, mensaje);
  fondo.append(caja);
  document.body.append(fondo);
  fondo.addEventListener('pointerup', (event) => event.stopPropagation());
  fondo.addEventListener('click', (event) => {
    if (event.target === fondo) fondo.hidden = true;
  });
  let creando = false;
  let ocupado = false;

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const email = correo.value.trim();
    if (creando) entra(() => cloud.signUp(email, clave.value, nombre.value.trim()));
    else entra(() => cloud.signIn(email, clave.value));
  });

  // Hace lo que se pida y dice cómo ha ido. `exito`: lo que se dice si ha ido bien (si no, se cierra).
  async function entra(fn, exito = null) {
    if (ocupado) return;
    ocupado = true;
    aviso = '';
    pintaVentana();
    const r = await fn();
    ocupado = false;
    if (r.error) aviso = t(r.error);
    else if (exito) aviso = t(exito);
    else if (!r.error) fondo.hidden = true;
    pintaVentana();
    pinta();
  }

  function pintaVentana() {
    titulo.textContent = t('cuenta.titulo');
    cerrar.title = t('ajustes.cerrar');
    google.innerHTML = `${G}<span>${t('cuenta.google')}</span>`;
    o.textContent = t('cuenta.o');
    nombre.placeholder = t('cuenta.nombre');
    nombre.hidden = !creando;
    correo.placeholder = t('cuenta.correo');
    clave.placeholder = t('cuenta.clave');
    clave.autocomplete = creando ? 'new-password' : 'current-password';
    enviar.textContent = creando ? t('cuenta.crear') : t('cuenta.entrar');
    cambia.textContent = creando ? t('cuenta.tengo') : t('cuenta.notengo');
    olvido.textContent = t('cuenta.olvide');
    olvido.hidden = creando;
    mensaje.textContent = aviso;
    for (const control of [google, enviar, cambia, olvido]) control.disabled = ocupado;
  }

  // LA ZONA DE LA CUENTA, en el panel del ranking.
  function pinta() {
    area.replaceChildren();
    if (!user) {
      area.append(el('p', 'cuenta-texto', t('cuenta.sin')), boton('cuenta-boton', t('cuenta.entrarOcrear'), () => {
        aviso = '';
        fondo.hidden = false;
        pintaVentana();
      }));
      return;
    }
    const inicial = el('span', 'cuenta-inicial', (user.name || user.email || '?').trim().charAt(0).toUpperCase());
    const textos = el('div', 'cuenta-textos');
    textos.append(el('strong', 'cuenta-quien', user.name || user.email));
    if (user.verified) {
      textos.append(el('span', 'cuenta-texto', t('cuenta.nube')));
      area.append(inicial, textos, boton('cuenta-boton secundario', t('cuenta.salir'), () => cloud.signOut()));
      return;
    }
    textos.append(el('span', 'cuenta-texto', t('cuenta.verifica', { correo: user.email })));
    const acciones = el('div', 'cuenta-acciones');
    acciones.append(
      boton('cuenta-boton', t('cuenta.confirmada'), () => cloud.refresh()),
      boton('cuenta-boton secundario', t('cuenta.reenviar'), async () => {
        const r = await cloud.resendVerification();
        alertaEn(acciones, r.error ? t(r.error) : t('cuenta.enviado'));
      }),
      boton('cuenta-boton secundario', t('cuenta.salir'), () => cloud.signOut()),
    );
    area.append(inicial, textos, acciones);
  }
  function alertaEn(donde, texto) {
    donde.querySelector('.cuenta-alerta')?.remove();
    donde.append(el('span', 'cuenta-alerta', texto));
  }

  cloud.onUser((u) => {
    user = u;
    pinta();
  });
  // Al volver a la pestaña (después de abrir el enlace del correo), se mira si ya está confirmada.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && user && !user.verified) cloud.refresh();
  });
  onLanguage(() => {
    pinta();
    pintaVentana();
  });
  pinta();
  pintaVentana();
  return { refresh: pinta };
}
