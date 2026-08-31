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
const SUGERENCIAS = `${window.CONFIG.SUPABASE_URL}/rest/v1/sugerencias`;
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
let sugerencias = [];
let sugerenciaEnCurso = null;   // sugerencia que se está pasando a la lista

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
        <button class="btn-secundario mini" data-generar="${r.id}">Carta</button>
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
      if (sugerenciaEnCurso) {
        try {
          await pedir(`${SUGERENCIAS}?id=eq.${sugerenciaEnCurso}`, {
            method: "PATCH",
            body: JSON.stringify({ atendida: true }),
          });
        } catch (e) { /* si falla, la sugerencia queda pendiente */ }
        sugerenciaEnCurso = null;
        cargarSugerencias();
      }
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
  sugerenciaEnCurso = null;
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
  const generar = e.target.dataset.generar;

  if (carta) { abrirCarta(carta); return; }
  if (generar) {
    const r = todos.find((x) => String(x.id) === generar);
    if (r) abrirPanelCarta(r);
    return;
  }

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

// ===================== Generador de carta =====================
const LOGO_CARTA = "logo.png?v=4";
let registroCarta = null;

function fechaLarga() {
  const meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
                 "agosto", "setiembre", "octubre", "noviembre", "diciembre"];
  const f = new Date();
  return `${f.getDate()} de ${meses[f.getMonth()]} de ${f.getFullYear()}`;
}

function cuerpoCarta({ empresa, persona, aporte, responsable, fecha }) {
  const marca = (t, vacio) => t ? escapar(t) : `<span class="dato">${vacio}</span>`;
  return `
    <div class="membrete">
      <img src="${LOGO_CARTA}" alt="Hogar de Oro">
      <div>
        <h1>HOGAR DE ORO</h1>
        <div class="lema">Porque su memoria no se quema, se honra.</div>
        <div class="curso">Instituto Tecnológico de Costa Rica, curso PI-4802 Administración de Proyectos</div>
      </div>
    </div>
    <div class="regla"></div>

    <div class="fecha"><span class="dato">${escapar(fecha)}</span></div>

    <p style="margin-bottom:2px"><span class="dato">${escapar(empresa)}</span></p>
    ${persona ? `<p style="margin-bottom:2px">${escapar(persona)}</p>` : ""}
    <p style="color:#7A6F5F">Presente</p>

    <p style="margin-top:14px"><strong>Asunto:</strong> Solicitud de colaboración para el proyecto Hogar de Oro</p>

    <p style="margin-top:14px">Estimados señores:</p>

    <p>Reciba un cordial saludo. Somos alrededor de 70 estudiantes de Ingeniería en Producción Industrial
    e Ingeniería Física del Instituto Tecnológico de Costa Rica (TEC) y, como parte del curso PI-4802
    Administración de Proyectos, desarrollamos Hogar de Oro, una iniciativa en beneficio del Hogar de
    Ancianos Santiago Crespo Calvo, ubicado en Alajuela. El Hogar brinda atención integral a
    <strong>aproximadamente 200 personas adultas mayores</strong>, muchas de ellas en situación de riesgo
    social y sin red familiar que las acompañe.</p>

    <p>En julio de 2026, un incendio afectó <strong>20 habitaciones</strong> de la institución y dejó a esos
    residentes sin su espacio propio. Desde allí, nuestro objetivo es contribuir con la recuperación de los
    espacios afectados y con la adquisición de los materiales necesarios para su reconstrucción.</p>

    <p>Para alcanzar esta meta, durante estos meses estaremos realizando ventas, bingos, rifas y otras
    actividades de recaudación, además de gestionar alianzas con empresas, instituciones y emprendimientos
    que deseen sumarse. Por esta razón, acudimos respetuosamente a
    <span class="dato">${escapar(empresa)}</span> para solicitar ${marca(aporte, "[QUÉ SE SOLICITA]")}.
    Dependiendo del tipo de aporte, este podrá utilizarse directamente en el proyecto o incorporarse a
    nuestras actividades para transformarlo en recursos destinados a la causa.</p>

    <p>Cada aporte suma y nos acerca a la meta del proyecto. Si la modalidad solicitada no estuviera dentro
    de sus posibilidades, cualquier otra forma de colaboración es bien recibida. Agradecemos sinceramente su
    tiempo y la posibilidad de considerar esta solicitud; quedamos a disposición para ampliar la información
    y coordinar cualquier detalle necesario.</p>

    <p style="margin-top:16px">Atentamente,</p>

    <div style="width:48%; margin-top:26px">
      <div class="firma-linea"></div>
      <div><strong>${escapar(responsable) || "[NOMBRE DEL RESPONSABLE]"}</strong></div>
      <div style="color:#6B4423">Equipo de Patrocinios y Donaciones</div>
    </div>

    <div class="firmas" style="margin-top:26px">
      <div>
        <div class="firma-linea"></div>
        <div><strong>María José Rodríguez Chanto</strong></div>
        <div style="color:#6B4423">Coordinación de Patrocinios</div>
        <div style="color:#7A6F5F">mar.rodriguez.chanto@estudiantec.cr</div>
      </div>
      <div>
        <div class="firma-linea"></div>
        <div><strong>Felipe de Jesús Sánchez Montero</strong></div>
        <div style="color:#6B4423">Gerencia del Proyecto</div>
        <div style="color:#7A6F5F">felsanchez@estudiantec.cr</div>
      </div>
    </div>

    <div class="pie">
      <strong>Instituto Tecnológico de Costa Rica</strong>&nbsp;&nbsp;&nbsp;Instagram: @produ.impacta&nbsp;&nbsp;&nbsp;SINPE Móvil: 8426-5193 (Saúl)<br>
      Supervisión académica: prof_lfonseca@estudiantec.cr, lfonseca@itcr.ac.cr, hcordero@itcr.ac.cr
    </div>`;
}

function datosCarta() {
  return {
    empresa: document.getElementById("c-empresa").value,
    persona: document.getElementById("c-persona").value.trim(),
    aporte: document.getElementById("c-aporte").value.trim(),
    responsable: document.getElementById("c-responsable").value,
    fecha: document.getElementById("c-fecha").value,
  };
}

function pintarCarta() {
  document.getElementById("carta-vista").innerHTML = cuerpoCarta(datosCarta());
}

function llenarListaEmpresas() {
  const nombres = [...new Set(todos.map((r) => r.empresa).filter(Boolean))].sort();
  document.getElementById("lista-empresas").innerHTML =
    nombres.map((n) => `<option value="${escapar(n)}">`).join("");
}

function marcarOrigen() {
  const aviso = document.getElementById("c-origen");
  const guardar = document.getElementById("c-guardar");
  if (registroCarta) {
    aviso.textContent = `Registro #${registroCarta.id} · responsable: ${registroCarta.responsable || "sin asignar"}`;
    guardar.classList.remove("oculto");
  } else {
    aviso.textContent = "Esta empresa todavía no está en la lista. Puede pasarla al formulario para registrarla.";
    guardar.classList.add("oculto");
  }
}

function abrirPanelCarta(r) {
  registroCarta = r || null;
  llenarListaEmpresas();
  document.getElementById("c-empresa").value = r ? (r.empresa || "") : "";
  document.getElementById("c-persona").value = "";
  document.getElementById("c-aporte").value = "";
  document.getElementById("c-fecha").value = fechaLarga();
  document.getElementById("c-responsable").innerHTML =
    RESPONSABLES.map((n) => `<option value="${escapar(n)}"${r && n === r.responsable ? " selected" : ""}>${escapar(n)}</option>`).join("");
  marcarOrigen();
  pintarCarta();
  const panel = document.getElementById("panel-carta");
  panel.classList.remove("oculto");
  panel.scrollIntoView({ behavior: "smooth", block: "start" });
}

// Si escriben una empresa que ya existe, se reconoce sola.
document.getElementById("c-empresa").addEventListener("input", () => {
  const nombre = document.getElementById("c-empresa").value.trim().toLowerCase();
  const encontrado = todos.find((r) => (r.empresa || "").toLowerCase() === nombre);
  registroCarta = encontrado || null;
  if (encontrado && encontrado.responsable) {
    document.getElementById("c-responsable").value = encontrado.responsable;
  }
  marcarOrigen();
  pintarCarta();
});

document.getElementById("btn-carta-nueva").onclick = () => {
  const panel = document.getElementById("panel-carta");
  if (panel.classList.contains("oculto")) abrirPanelCarta(null);
  else panel.classList.add("oculto");
};

// Llevar los datos de la carta al formulario de registro
document.getElementById("c-formulario").onclick = () => {
  const d = datosCarta();
  if (!d.empresa) { avisar("Escriba primero la empresa.", true); return; }
  limpiarFormulario();
  form.elements["empresa"].value = d.empresa;
  form.elements["contacto"].value = d.persona || "";
  form.elements["responsable"].value = d.responsable || "";
  form.elements["estado"].value = ESTADO_GESTION;
  form.elements["descripcion"].value = d.aporte ? `Se solicitó ${d.aporte}.` : "";
  actualizarAyudas();
  abrirFormulario();
  document.getElementById("panel-carta").classList.add("oculto");
  avisar("Datos pasados al formulario. Revise y presione Guardar registro.");
  window.scrollTo({ top: 0, behavior: "smooth" });
};

["c-persona", "c-aporte", "c-responsable"].forEach((id) => {
  const el = document.getElementById(id);
  el.addEventListener("input", pintarCarta);
  el.addEventListener("change", pintarCarta);
});

document.getElementById("carta-cerrar").onclick = () =>
  document.getElementById("panel-carta").classList.add("oculto");

function documentoCarta() {
  const estilos = `
    body { font-family: Calibri, sans-serif; color: #2B2119; font-size: 11pt; line-height: 1.45; }
    .membrete { display: flex; align-items: center; gap: 16px; }
    .membrete img { width: 100px; }
    .membrete h1 { margin: 0; font-size: 20pt; letter-spacing: 3px; color: #C08A1E; }
    .lema { font-style: italic; color: #6B4423; font-size: 10pt; }
    .curso { color: #6E6357; font-size: 8.5pt; }
    .regla { border-bottom: 2.5px solid #C08A1E; margin: 10px 0 16px; }
    .fecha { text-align: right; margin-bottom: 14px; }
    p { text-align: justify; margin: 0 0 9px; }
    .dato { font-weight: bold; color: #6B4423; }
    .firma-linea { border-bottom: 1px solid #C08A1E; height: 24px; margin-bottom: 4px; width: 100%; }
    .firmas { width: 100%; }
    .pie { border-top: 2px solid #C08A1E; margin-top: 22px; padding-top: 6px; text-align: center; color: #6E6357; font-size: 8pt; }`;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Carta</title><style>${estilos}</style></head>
    <body>${cuerpoCarta(datosCarta()).replace('src="' + LOGO_CARTA + '"', 'src="' + location.origin + location.pathname.replace(/[^/]*$/, "") + LOGO_CARTA + '"')}</body></html>`;
}

function nombreArchivoCarta() {
  const limpio = (datosCarta().empresa || "empresa").replace(/[^a-zA-Z0-9 áéíóúñÁÉÍÓÚÑ._-]/g, "").trim();
  return `Carta - ${limpio}`;
}

document.getElementById("c-word").onclick = () => {
  if (!document.getElementById("c-aporte").value.trim()) {
    avisar("Escriba qué se le va a solicitar a la empresa.", true); return;
  }
  const blob = new Blob(["\ufeff", documentoCarta()], { type: "application/msword" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = nombreArchivoCarta() + ".doc";
  a.click();
  URL.revokeObjectURL(a.href);
  avisar("Carta descargada. Se abre en Word y se puede editar antes de enviarla.");
};

document.getElementById("c-pdf").onclick = () => {
  const v = window.open("", "_blank");
  v.document.write(documentoCarta());
  v.document.close();
  setTimeout(() => v.print(), 600);
};

document.getElementById("c-guardar").onclick = async () => {
  if (!registroCarta) return;
  if (!document.getElementById("c-aporte").value.trim()) {
    avisar("Escriba qué se le va a solicitar a la empresa.", true); return;
  }
  const boton = document.getElementById("c-guardar");
  boton.disabled = true;
  boton.textContent = "Guardando...";
  try {
    const archivo = new File([documentoCarta()], nombreArchivoCarta() + ".doc", { type: "application/msword" });
    const ruta = await subirCarta(archivo);
    await pedir(`${API}?id=eq.${registroCarta.id}`, {
      method: "PATCH",
      body: JSON.stringify({ carta_url: ruta }),
    });
    avisar("La carta quedó guardada en el registro.");
    document.getElementById("panel-carta").classList.add("oculto");
    cargar();
  } catch (e) {
    avisar(e.message, true);
  } finally {
    boton.disabled = false;
    boton.textContent = "Guardar en el registro";
  }
};

// ===================== Sugerencias de otros compañeros =====================
function fechaCorta(texto) {
  if (!texto) return "";
  const f = new Date(texto);
  return isNaN(f) ? "" : f.toLocaleDateString("es-CR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

async function cargarSugerencias() {
  try {
    sugerencias = (await pedir(`${SUGERENCIAS}?select=*&atendida=is.false&order=id.desc`)) || [];
  } catch (e) {
    sugerencias = [];
  }
  const globo = document.getElementById("conteo-sugerencias");
  globo.textContent = sugerencias.length;
  globo.classList.toggle("vacio-cero", sugerencias.length === 0);
  dibujarSugerencias();
}

function dibujarSugerencias() {
  const caja = document.getElementById("lista-sugerencias");
  if (!sugerencias.length) {
    caja.innerHTML = `<p class="vacio">Por ahora no hay sugerencias sin revisar.</p>`;
    return;
  }
  caja.innerHTML = sugerencias.map((s) => `
    <div class="sugerencia">
      <h3>${escapar(s.empresa)}</h3>
      ${s.contacto ? `<p><strong>Contacto:</strong> ${escapar(s.contacto)}</p>` : ""}
      ${s.aporte ? `<p><strong>Podrían aportar:</strong> ${escapar(s.aporte)}</p>` : ""}
      <p class="quien">Sugerido por ${escapar(s.sugerido_por) || "alguien sin nombre"} · ${fechaCorta(s.creado)}</p>
      <div class="acciones-sug">
        <button class="btn-principal mini" data-pasar="${s.id}">Pasar a la lista</button>
        <button class="btn-secundario mini" data-descartar="${s.id}">Descartar</button>
      </div>
    </div>`).join("");
}

document.getElementById("lista-sugerencias").addEventListener("click", async (e) => {
  const pasar = e.target.dataset.pasar;
  const descartar = e.target.dataset.descartar;

  if (pasar) {
    const s = sugerencias.find((x) => String(x.id) === pasar);
    if (!s) return;
    limpiarFormulario();
    form.elements["empresa"].value = s.empresa || "";
    form.elements["contacto"].value = s.contacto || "";
    form.elements["estado"].value = ESTADO_GESTION;
    form.elements["descripcion"].value =
      [s.aporte, s.sugerido_por ? `Sugerido por ${s.sugerido_por}` : ""].filter(Boolean).join(" · ");
    sugerenciaEnCurso = s.id;
    actualizarAyudas();
    abrirFormulario();
    document.getElementById("panel-sugerencias").classList.add("oculto");
    avisar("Escoja el responsable y guarde. La sugerencia se marca como atendida al guardar.");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (descartar) {
    try {
      await pedir(`${SUGERENCIAS}?id=eq.${descartar}`, {
        method: "PATCH",
        body: JSON.stringify({ atendida: true }),
      });
      avisar("Sugerencia descartada.");
      cargarSugerencias();
    } catch (err) {
      avisar(err.message, true);
    }
  }
});

document.getElementById("btn-sugerencias").onclick = () => {
  const panel = document.getElementById("panel-sugerencias");
  panel.classList.toggle("oculto");
  if (!panel.classList.contains("oculto")) {
    cargarSugerencias();
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
  }
};

document.getElementById("btn-cerrar-sugerencias").onclick = () =>
  document.getElementById("panel-sugerencias").classList.add("oculto");

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
  cargarSugerencias();
}

if (leerSesion()) arrancarApp();
