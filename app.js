// ===========================================================================
// Hogar de Oro · Control de Patrocinios y Donaciones
// Página estática que consulta Supabase directamente desde el navegador.
// ===========================================================================

const ESTADOS = ["En gestión", "Donación conseguida", "Negada"];

const ESTADOS_DESC = {
  "En gestión": "Ya se contactó a la empresa: se espera respuesta o se está negociando el aporte.",
  "Donación conseguida": "La empresa confirmó el aporte. Desde aquí se suma al valor total conseguido.",
  "Negada": "La empresa indicó que no desea participar.",
};

const ESTADOS_CLASE = {
  "En gestión": "e-gestion",
  "Donación conseguida": "e-realizada",
  "Negada": "e-negada",
};

const ESTADO_RECIBIDO = "Donación conseguida";
const ESTADO_GESTION = "En gestión";

// Uso del aporte
const USO_PENDIENTE = "Pendiente de usar";
const USO_USADO = "Ya usado";
const USO_DINERO = "Aporte en dinero";
const USOS = [USO_PENDIENTE, USO_USADO, USO_DINERO];

const USOS_DESC = {
  [USO_PENDIENTE]: "Todavía está disponible. Debe indicar para qué actividad se va a usar.",
  [USO_USADO]: "Ya se entregó o se ocupó. Pasa a la pantalla “Ya usado”.",
  [USO_DINERO]: "Aporte en efectivo o transferencia. Pasa a la pantalla “Dinero”.",
};

const DESTINOS = [
  "Ejecución del proyecto (materiales y mano de obra)",
  "Bingos",
  "Ventas dentro del TEC",
  "Fiestas",
  "Noches bailables",
  "Actividades deportivas",
  "Rifas",
];

const RESPONSABLES = [
  "Andrey Enrique Arce Gutiérrez",
  "Zyan Levi Bolaños Arias",
  "Naomy Castro Mairena",
  "Loanna Castro Morales",
  "Marco Rodrigo Corrales Barrantes",
  "Gabriel Del Campo Gutiérrez",
  "Karim Figueroa Zúñiga",
  "Zhaid Gómez Alcázar",
  "Karina Gómez Sánchez",
  "Elisa Gutiérrez Feoli",
  "Ariela Lucía Hernández Araya",
  "Melany Hernández Solís",
  "Israel Larios Zamora",
  "Juan Pablo Mora Brenes",
  "Jixia Nova Rodríguez",
  "Oscar Palma Castellón",
  "Elián Porras Zúñiga",
  "María José Rodríguez Chanto",
  "María José Varela Montoya",
  "Luis Alejandro Varela Viloria",
];

const TIPOS_SUGERIDOS = [
  "Dinero", "Comida", "Postres", "Bebidas", "Servicios", "Materiales",
  "Entradas", "Rifa", "Deporte", "Cupones", "Impresiones",
];

const CAMPOS = [
  "empresa", "contacto", "responsable", "estado", "tipo_aporte",
  "descripcion", "valor_aproximado", "asignacion", "destino", "carta_url",
];

// ===================== Conexión con Supabase =====================
const API = `${window.CONFIG.SUPABASE_URL}/rest/v1/${window.CONFIG.TABLA}`;
const AUTH = `${window.CONFIG.SUPABASE_URL}/auth/v1`;
const ALMACEN = `${window.CONFIG.SUPABASE_URL}/storage/v1/object`;
const BALDE = window.CONFIG.BALDE || "cartas";
const LLAVE_SESION = "patrocinios_sesion";

let sesion = null;

function guardarSesion(datos) {
  sesion = {
    access_token: datos.access_token,
    refresh_token: datos.refresh_token,
    expires_at: Date.now() + (datos.expires_in || 3600) * 1000,
  };
  try { localStorage.setItem(LLAVE_SESION, JSON.stringify(sesion)); } catch (e) {}
}

function leerSesion() {
  try {
    const guardado = localStorage.getItem(LLAVE_SESION);
    if (guardado) sesion = JSON.parse(guardado);
  } catch (e) { sesion = null; }
  return sesion;
}

function borrarSesion() {
  sesion = null;
  try { localStorage.removeItem(LLAVE_SESION); } catch (e) {}
}

async function iniciarSesion(correo, clave) {
  const res = await fetch(`${AUTH}/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: window.CONFIG.SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email: correo, password: clave }),
  });
  const datos = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(datos.error_description || datos.msg || "Correo o contraseña incorrectos.");
  guardarSesion(datos);
  return sesion;
}

async function renovarSesion() {
  if (!sesion || !sesion.refresh_token) return false;
  const res = await fetch(`${AUTH}/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { apikey: window.CONFIG.SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: sesion.refresh_token }),
  });
  if (!res.ok) return false;
  guardarSesion(await res.json());
  return true;
}

function cabeceras(extra = {}) {
  return {
    apikey: window.CONFIG.SUPABASE_ANON_KEY,
    Authorization: `Bearer ${sesion ? sesion.access_token : window.CONFIG.SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function pedir(url, opciones = {}, reintento = true) {
  if (sesion && sesion.expires_at && Date.now() > sesion.expires_at - 60000) await renovarSesion();

  const opts = { ...opciones, headers: { ...cabeceras(), ...(opciones.headers || {}) } };
  const res = await fetch(url, opts);

  if ((res.status === 401 || res.status === 403) && reintento) {
    if (await renovarSesion()) return pedir(url, opciones, false);
    borrarSesion();
    mostrarLogin("Su sesión expiró. Vuelva a ingresar.");
    throw new Error("Sesión expirada.");
  }
  if (!res.ok) {
    let detalle = "";
    try { const d = await res.json(); detalle = d.message || d.hint || JSON.stringify(d); }
    catch (e) { detalle = `Error ${res.status}`; }
    throw new Error(detalle);
  }
  if (res.status === 204) return null;
  const texto = await res.text();
  return texto ? JSON.parse(texto) : null;
}

// Sube la carta al almacenamiento privado y devuelve la ruta del archivo.
async function subirCarta(archivo) {
  const limpio = archivo.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const ruta = `${Date.now()}_${limpio}`;
  const res = await fetch(`${ALMACEN}/${BALDE}/${ruta}`, {
    method: "POST",
    headers: {
      apikey: window.CONFIG.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${sesion ? sesion.access_token : ""}`,
      "x-upsert": "true",
    },
    body: archivo,
  });
  if (!res.ok) throw new Error("No se pudo subir la carta.");
  return ruta;
}

// El archivo es privado: se pide un enlace temporal para poder verlo.
async function abrirCarta(ruta) {
  const ventana = window.open("", "_blank");
  try {
    if (/^https?:\/\//.test(ruta)) { ventana.location = ruta; return; }
    const res = await fetch(`${window.CONFIG.SUPABASE_URL}/storage/v1/object/sign/${BALDE}/${ruta}`, {
      method: "POST",
      headers: cabeceras(),
      body: JSON.stringify({ expiresIn: 3600 }),
    });
    if (!res.ok) throw new Error("No se pudo abrir la carta.");
    const datos = await res.json();
    ventana.location = `${window.CONFIG.SUPABASE_URL}/storage/v1${datos.signedURL}`;
  } catch (e) {
    if (ventana) ventana.close();
    avisar(e.message, true);
  }
}

// ===================== Estado de la aplicación =====================
let estadoActual = "";     // pestaña por estado
let usoActual = "";        // "", USO_PENDIENTE, "usado"
let destinoActual = "";    // chip de destino
let todos = [];
let visibles = [];
let idParaBorrar = null;

const form = document.getElementById("formulario");

// ===================== Utilidades =====================
function escapar(t) {
  return String(t ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function colones(n) {
  if (n === null || n === undefined || n === "") return "—";
  const num = Number(n);
  if (isNaN(num)) return "—";
  return "₡" + num.toLocaleString("es-CR", { maximumFractionDigits: 0 });
}

function avisar(texto, esError = false) {
  const caja = document.getElementById("aviso");
  caja.textContent = texto;
  caja.className = "aviso" + (esError ? " error" : "");
  clearTimeout(avisar.t);
  avisar.t = setTimeout(() => caja.classList.add("oculto"), 4000);
}

function mostrarLogin(mensaje = "") {
  document.getElementById("aplicacion").classList.add("oculto");
  document.getElementById("pantalla-login").classList.remove("oculto");
  const err = document.getElementById("login-error");
  err.textContent = mensaje;
  err.classList.toggle("oculto", !mensaje);
}

function esPendiente(r) { return (r.asignacion || "") === USO_PENDIENTE; }
function esUsadoODinero(r) {
  const a = r.asignacion || "";
  return a === USO_USADO || a === USO_DINERO;
}

// ===================== Listas del formulario =====================
function llenarListas() {
  document.getElementById("select-estado").innerHTML =
    ESTADOS.map((e) => `<option value="${escapar(e)}">${escapar(e)}</option>`).join("");

  document.getElementById("select-uso").innerHTML =
    `<option value="">— Seleccione —</option>` +
    USOS.map((u) => `<option value="${escapar(u)}">${escapar(u)}</option>`).join("");

  document.getElementById("select-destino").innerHTML =
    `<option value="">— Seleccione la actividad —</option>` +
    DESTINOS.map((d) => `<option value="${escapar(d)}">${escapar(d)}</option>`).join("");

  document.getElementById("select-responsable").innerHTML =
    `<option value="">— Seleccione su nombre —</option>` +
    RESPONSABLES.map((r) => `<option value="${escapar(r)}">${escapar(r)}</option>`).join("");

  document.getElementById("lista-tipos").innerHTML =
    TIPOS_SUGERIDOS.map((t) => `<option value="${escapar(t)}">`).join("");

  document.getElementById("f-responsable").innerHTML =
    `<option value="">Todos los responsables</option>` +
    RESPONSABLES.map((r) => `<option value="${escapar(r)}">${escapar(r)}</option>`).join("");
}

function actualizarAyudas() {
  const estado = document.getElementById("select-estado").value;
  document.getElementById("ayuda-estado").textContent = ESTADOS_DESC[estado] || "";

  // El aporte solo se detalla cuando la donación ya está conseguida.
  const conseguida = estado === ESTADO_RECIBIDO;
  document.querySelectorAll(".solo-conseguida").forEach((el) => el.classList.toggle("oculto", !conseguida));
  document.getElementById("nota-estado").classList.toggle("oculto", conseguida);
  document.getElementById("select-uso").required = conseguida;

  const uso = document.getElementById("select-uso").value;
  document.getElementById("ayuda-uso").textContent = USOS_DESC[uso] || "";

  // Pendiente de usar: lista de actividades. Ya usado: se escribe la actividad.
  const pendiente = conseguida && uso === USO_PENDIENTE;
  const usado = conseguida && uso === USO_USADO;

  document.getElementById("campo-destino").classList.toggle("oculto", !(pendiente || usado));
  document.getElementById("select-destino").classList.toggle("oculto", !pendiente);
  document.getElementById("texto-destino").classList.toggle("oculto", !usado);
  document.getElementById("select-destino").required = pendiente;

  document.getElementById("rotulo-destino").innerHTML = usado
    ? "¿En qué actividad se usó?"
    : "¿Para qué se va a usar? <span class=\"req\">*</span>";
  document.getElementById("ayuda-destino").textContent = usado
    ? "Escriba la actividad donde se entregó o se ocupó el aporte."
    : "Obligatorio cuando el aporte está pendiente de usar.";
}

// ===================== Cargar y dibujar =====================
async function cargar() {
  try {
    todos = (await pedir(`${API}?select=*&order=id.desc`)) || [];
    aplicarFiltros();
  } catch (e) {
    avisar(e.message, true);
  }
}

function aplicarFiltros() {
  const texto = document.getElementById("f-buscar").value.trim().toLowerCase();
  const resp = document.getElementById("f-responsable").value;

  visibles = todos.filter((r) => {
    if (estadoActual && r.estado !== estadoActual) return false;
    if (usoActual && (r.asignacion || "") !== usoActual) return false;
    if (destinoActual && (r.destino || "") !== destinoActual) return false;
    if (resp && r.responsable !== resp) return false;
    if (texto) {
      const todoElTexto = [
        r.empresa, r.contacto, r.responsable, r.estado, r.tipo_aporte,
        r.descripcion, r.asignacion, r.destino, r.valor_aproximado,
      ].join(" ").toLowerCase();
      if (!todoElTexto.includes(texto)) return false;
    }
    return true;
  });

  dibujarTabla();
  dibujarResumen();
  dibujarConteos();
  dibujarChips();
}

function dibujarTabla() {
  const cuerpo = document.getElementById("cuerpo-tabla");
  cuerpo.innerHTML = visibles.map((r) => {
    const carta = r.carta_url
      ? `<button class="enlace-carta" data-carta="${escapar(r.carta_url)}">Ver</button>`
      : "—";
    const uso = r.asignacion
      ? `<div class="marca-uso"><b>${escapar(r.asignacion)}</b>${r.destino ? `<span>${escapar(r.destino)}</span>` : ""}</div>`
      : "—";
    return `<tr>
      <td>${r.id}</td>
      <td><strong>${escapar(r.empresa)}</strong></td>
      <td>${escapar(r.contacto) || "—"}</td>
      <td>${escapar(r.responsable) || "—"}</td>
      <td><span class="etiqueta-estado ${ESTADOS_CLASE[r.estado] || ""}">${escapar(r.estado)}</span></td>
      <td>${escapar(r.tipo_aporte) || "—"}</td>
      <td>${escapar(r.descripcion) || "—"}</td>
      <td>${colones(r.valor_aproximado)}</td>
      <td>${uso}</td>
      <td>${carta}</td>
      <td><div class="acciones-fila">
        <button class="btn-secundario mini" data-editar="${r.id}">Editar</button>
        <button class="btn-peligro mini" data-borrar="${r.id}">Borrar</button>
      </div></td>
    </tr>`;
  }).join("");

  document.getElementById("vacio").classList.toggle("oculto", visibles.length > 0);
}

function dibujarResumen() {
  const resp = document.getElementById("f-responsable").value;
  const recibido = visibles
    .filter((r) => r.estado === ESTADO_RECIBIDO)
    .reduce((s, r) => s + (Number(r.valor_aproximado) || 0), 0);

  document.getElementById("r-total").textContent = visibles.length;
  document.getElementById("r-proceso").textContent = visibles.filter((r) => r.estado === ESTADO_GESTION).length;
  document.getElementById("r-recibidas").textContent = visibles.filter((r) => r.estado === ESTADO_RECIBIDO).length;
  document.getElementById("r-monto").textContent = colones(recibido);
  document.getElementById("r-monto-txt").textContent = resp
    ? `Monto logrado por ${resp.split(" ")[0]}`
    : "Valor total conseguido";
}

function dibujarConteos() {
  const cuenta = (e) => todos.filter((r) => {
    if (e && r.estado !== e) return false;
    if (usoActual && (r.asignacion || "") !== usoActual) return false;
    return true;
  }).length;

  document.querySelectorAll("[data-conteo]").forEach((el) => {
    el.textContent = cuenta(el.dataset.conteo);
  });
}

function dibujarChips() {
  const caja = document.getElementById("chips-destino");
  if (!usoAplica() || usoActual !== USO_PENDIENTE) { caja.innerHTML = ""; return; }

  const base = todos.filter((r) => esPendiente(r) && (!estadoActual || r.estado === estadoActual));
  const total = base.reduce((s, r) => s + (Number(r.valor_aproximado) || 0), 0);

  caja.innerHTML =
    `<button class="chip ${destinoActual ? "" : "activa"}" data-destino="">Todas las actividades
       <span class="monto">${base.length} · ${colones(total)}</span></button>` +
    DESTINOS.map((d) => {
      const lista = base.filter((r) => (r.destino || "") === d);
      const monto = lista.reduce((s, r) => s + (Number(r.valor_aproximado) || 0), 0);
      return `<button class="chip ${destinoActual === d ? "activa" : ""}" data-destino="${escapar(d)}">${escapar(d)}
        <span class="monto">${lista.length} · ${colones(monto)}</span></button>`;
    }).join("");

  caja.querySelectorAll(".chip").forEach((c) => {
    c.onclick = () => { destinoActual = c.dataset.destino; aplicarFiltros(); };
  });
}

// ===================== Pestañas =====================
function dibujarPestanas() {
  document.getElementById("pestanas").innerHTML =
    `<button class="pestana activa" data-estado="">Todos <span class="conteo" data-conteo=""></span></button>` +
    ESTADOS.map((e) =>
      `<button class="pestana" data-estado="${escapar(e)}">${escapar(e)} <span class="conteo" data-conteo="${escapar(e)}"></span></button>`
    ).join("");

  document.querySelectorAll(".pestana").forEach((btn) => {
    btn.onclick = () => {
      document.querySelectorAll(".pestana").forEach((b) => b.classList.remove("activa"));
      btn.classList.add("activa");
      estadoActual = btn.dataset.estado || "";
      document.getElementById("desc-pantalla").textContent =
        estadoActual ? ESTADOS_DESC[estadoActual] : "Todos los registros ingresados.";
      if (!form.elements["id"].value) form.elements["estado"].value = estadoActual || ESTADOS[0];
      actualizarAyudas();
      dibujarBarraUso();
      aplicarFiltros();
    };
  });
}

// La barra de uso solo tiene sentido donde hay aportes conseguidos.
function usoAplica() {
  return estadoActual === "" || estadoActual === ESTADO_RECIBIDO;
}

function dibujarBarraUso() {
  const caja0 = document.getElementById("barra-uso");
  if (!usoAplica()) {
    usoActual = "";
    destinoActual = "";
    caja0.innerHTML = "";
    document.getElementById("chips-destino").innerHTML = "";
    return;
  }
  const opciones = [
    { v: "", t: "Todo" },
    { v: USO_PENDIENTE, t: "Por usar" },
    { v: USO_USADO, t: "Ya usado" },
    { v: USO_DINERO, t: "Dinero" },
  ];
  const caja = document.getElementById("barra-uso");
  caja.innerHTML = opciones.map((o) =>
    `<button class="btn-uso ${usoActual === o.v ? "activa" : ""}" data-uso="${o.v}">${o.t}</button>`).join("");
  caja.querySelectorAll(".btn-uso").forEach((b) => {
    b.onclick = () => {
      usoActual = b.dataset.uso;
      if (usoActual !== USO_PENDIENTE) destinoActual = "";
      dibujarBarraUso();
      aplicarFiltros();
    };
  });
}

// ===================== Guardar =====================
form.onsubmit = async (e) => {
  e.preventDefault();
  const boton = document.getElementById("btn-guardar");
  const datos = {};
  CAMPOS.forEach((c) => {
    if (c === "carta_url") return;
    const campo = form.elements[c];
    if (campo) datos[c] = campo.value.trim ? campo.value.trim() : campo.value;
  });

  if (!datos.responsable) { avisar("Escoja el responsable.", true); return; }
  if (datos.estado !== ESTADO_RECIBIDO) {
    datos.tipo_aporte = "";
    datos.valor_aproximado = "";
    datos.asignacion = "";
    datos.destino = "";
  }
  if (datos.asignacion === USO_PENDIENTE && !datos.destino) {
    avisar("Indique para qué actividad se va a usar el aporte.", true); return;
  }
  if (datos.asignacion === USO_USADO) {
    datos.destino = document.getElementById("texto-destino").value.trim();
  } else if (datos.asignacion !== USO_PENDIENTE) {
    datos.destino = "";
  }
  datos.valor_aproximado = datos.valor_aproximado === "" ? null : Number(datos.valor_aproximado);

  const id = form.elements["id"].value;
  boton.disabled = true;
  boton.textContent = "Guardando...";

  try {
    const archivo = document.getElementById("archivo-carta").files[0];
    if (archivo) {
      boton.textContent = "Subiendo carta...";
      datos.carta_url = await subirCarta(archivo);
    }

    if (id) {
      await pedir(`${API}?id=eq.${id}`, {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(datos),
      });
      avisar(`Registro actualizado. Ahora aparece en "${datos.estado}".`);
    } else {
      await pedir(API, {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(datos),
      });
      avisar(`Registro guardado en la pantalla "${datos.estado}".`);
    }
    limpiarFormulario();
    await cargar();
  } catch (err) {
    avisar(err.message, true);
  } finally {
    boton.disabled = false;
    boton.textContent = "Guardar registro";
  }
};

function limpiarFormulario() {
  form.reset();
  form.elements["id"].value = "";
  form.elements["estado"].value = estadoActual || ESTADOS[0];
  document.getElementById("archivo-carta").value = "";
  document.getElementById("titulo-form").textContent = "Agregar registro";
  document.getElementById("btn-cancelar").classList.add("oculto");
  actualizarAyudas();
}

document.getElementById("btn-cancelar").onclick = limpiarFormulario;

// ===================== Editar y borrar =====================
document.getElementById("cuerpo-tabla").addEventListener("click", (e) => {
  const editar = e.target.dataset.editar;
  const borrar = e.target.dataset.borrar;
  const carta = e.target.dataset.carta;

  if (carta) { abrirCarta(carta); return; }

  if (editar) {
    const r = todos.find((x) => String(x.id) === editar);
    if (!r) return;
    CAMPOS.forEach((c) => {
      if (form.elements[c]) form.elements[c].value = r[c] ?? "";
    });
    form.elements["id"].value = r.id;
    if ((r.asignacion || "") === USO_USADO) {
      document.getElementById("texto-destino").value = r.destino || "";
      document.getElementById("select-destino").value = "";
    } else {
      document.getElementById("texto-destino").value = "";
    }
    document.getElementById("titulo-form").textContent = `Editando: ${r.empresa}`;
    document.getElementById("btn-cancelar").classList.remove("oculto");
    document.getElementById("ayuda-carta").textContent = r.carta_url
      ? "Ya tiene una carta subida. Si escoge otra, se reemplaza."
      : "Puede subir la carta o la nota que se envió. PDF, Word o imagen.";
    abrirFormulario();
    actualizarAyudas();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (borrar) {
    idParaBorrar = borrar;
    const r = todos.find((x) => String(x.id) === borrar);
    document.getElementById("modal-texto").textContent =
      `¿Seguro que desea eliminar el registro de ${r ? r.empresa : "esta empresa"}?`;
    document.getElementById("modal-fondo").classList.remove("oculto");
  }
});

document.getElementById("modal-cancelar").onclick = () => {
  document.getElementById("modal-fondo").classList.add("oculto");
  idParaBorrar = null;
};

document.getElementById("modal-confirmar").onclick = async () => {
  if (!idParaBorrar) return;
  try {
    await pedir(`${API}?id=eq.${idParaBorrar}`, { method: "DELETE" });
    avisar("Registro eliminado.");
    await cargar();
  } catch (e) {
    avisar(e.message, true);
  }
  document.getElementById("modal-fondo").classList.add("oculto");
  idParaBorrar = null;
};

// ===================== Excel =====================
document.getElementById("btn-excel").onclick = () => {
  if (typeof XLSX === "undefined") { avisar("No se pudo cargar el generador de Excel.", true); return; }
  const libro = XLSX.utils.book_new();
  const fila = (r) => ({
    "#": r.id,
    Empresa: r.empresa || "",
    Contacto: r.contacto || "",
    Responsable: r.responsable || "",
    Estado: r.estado || "",
    "Tipo de aporte": r.tipo_aporte || "",
    "Detalle y observaciones": r.descripcion || "",
    "Valor aproximado": r.valor_aproximado || "",
    Uso: r.asignacion || "",
    "Actividad": r.destino || "",
    Carta: r.carta_url ? "Sí" : "",
  });

  const agregar = (nombre, lista) => {
    if (!lista.length) return;
    XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(lista.map(fila)), nombre.slice(0, 31));
  };

  const orden = [...todos].sort((a, b) => a.id - b.id);
  agregar("Todos", orden);
  ESTADOS.forEach((e) => agregar(e, orden.filter((r) => r.estado === e)));
  DESTINOS.forEach((d) => agregar("Por usar - " + d.split(" ")[0], orden.filter((r) => esPendiente(r) && r.destino === d)));
  agregar("Ya usado", orden.filter((r) => (r.asignacion || "") === USO_USADO));
  agregar("Dinero", orden.filter((r) => (r.asignacion || "") === USO_DINERO));

  XLSX.writeFile(libro, "Patrocinios_Hogar_de_Oro.xlsx");
};

// ===================== Descargar todas las cartas =====================
async function enlaceFirmado(ruta) {
  if (/^https?:\/\//.test(ruta)) return ruta;
  const res = await fetch(`${window.CONFIG.SUPABASE_URL}/storage/v1/object/sign/${BALDE}/${ruta}`, {
    method: "POST",
    headers: cabeceras(),
    body: JSON.stringify({ expiresIn: 600 }),
  });
  if (!res.ok) throw new Error("No se pudo preparar el archivo.");
  const datos = await res.json();
  return `${window.CONFIG.SUPABASE_URL}/storage/v1${datos.signedURL}`;
}

function nombreLimpio(texto) {
  return String(texto || "").replace(/[\\/:*?"<>|]/g, "-").trim().slice(0, 60);
}

document.getElementById("btn-cartas").onclick = async () => {
  const conCarta = todos.filter((r) => r.carta_url);
  if (!conCarta.length) { avisar("Todavía no hay cartas subidas.", true); return; }
  if (typeof JSZip === "undefined") { avisar("No se pudo cargar el compresor de archivos.", true); return; }

  const boton = document.getElementById("btn-cartas");
  boton.disabled = true;
  const zip = new JSZip();
  let listos = 0, fallidos = 0;

  for (const r of conCarta) {
    boton.textContent = `Bajando ${listos + fallidos + 1} de ${conCarta.length}...`;
    try {
      const url = await enlaceFirmado(r.carta_url);
      const archivo = await fetch(url);
      if (!archivo.ok) throw new Error("archivo");
      const extension = (r.carta_url.split(".").pop() || "pdf").split("?")[0];
      zip.file(`${r.id} - ${nombreLimpio(r.empresa)}.${extension}`, await archivo.blob());
      listos++;
    } catch (e) {
      fallidos++;
    }
  }

  if (listos) {
    const contenido = await zip.generateAsync({ type: "blob" });
    const enlace = document.createElement("a");
    enlace.href = URL.createObjectURL(contenido);
    enlace.download = "Cartas_Hogar_de_Oro.zip";
    enlace.click();
    URL.revokeObjectURL(enlace.href);
  }

  boton.disabled = false;
  boton.textContent = "Descargar cartas";
  avisar(fallidos
    ? `Se bajaron ${listos} cartas. ${fallidos} no se pudieron abrir.`
    : `Listo: ${listos} cartas en la carpeta comprimida.`, fallidos > 0);
};

// ===================== Filtros y plegado =====================
document.getElementById("f-buscar").addEventListener("input", aplicarFiltros);
document.getElementById("f-responsable").addEventListener("change", aplicarFiltros);
document.getElementById("btn-limpiar").onclick = () => {
  document.getElementById("f-buscar").value = "";
  document.getElementById("f-responsable").value = "";
  destinoActual = "";
  aplicarFiltros();
};
document.getElementById("select-estado").addEventListener("change", actualizarAyudas);
document.getElementById("select-uso").addEventListener("change", actualizarAyudas);

function abrirFormulario() {
  form.classList.remove("oculto");
  document.getElementById("btn-plegar").textContent = "Ocultar formulario";
}
document.getElementById("btn-plegar").onclick = () => {
  const oculto = form.classList.toggle("oculto");
  document.getElementById("btn-plegar").textContent = oculto ? "Agregar registro" : "Ocultar formulario";
};

// ===================== Ingreso y arranque =====================
document.getElementById("form-login").onsubmit = async (e) => {
  e.preventDefault();
  const boton = document.getElementById("btn-entrar");
  boton.disabled = true;
  boton.textContent = "Entrando...";
  try {
    await iniciarSesion(
      document.getElementById("login-correo").value.trim(),
      document.getElementById("login-clave").value
    );
    arrancarApp();
  } catch (err) {
    const caja = document.getElementById("login-error");
    caja.textContent = err.message;
    caja.classList.remove("oculto");
  } finally {
    boton.disabled = false;
    boton.textContent = "Entrar";
  }
};

document.getElementById("btn-salir").onclick = () => {
  borrarSesion();
  location.reload();
};

function arrancarApp() {
  document.getElementById("pantalla-login").classList.add("oculto");
  document.getElementById("aplicacion").classList.remove("oculto");
  llenarListas();
  dibujarPestanas();
  dibujarBarraUso();
  limpiarFormulario();
  cargar();
}

if (leerSesion()) arrancarApp();
