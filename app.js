// ===========================================================================
// Control de Patrocinios y Donaciones
// Página estática que consulta Supabase directamente desde el navegador.
// ===========================================================================

const ESTADOS = [
  "Pendiente de contactar",
  "En espera de respuesta",
  "En negociación",
  "Aceptada",
  "Donación realizada",
  "Negada",
];

const ESTADOS_DESC = {
  "Pendiente de contactar": "Todavía no se ha hecho el primer contacto con la empresa.",
  "En espera de respuesta": "Ya se envió la propuesta y se espera que respondan.",
  "En negociación": "La empresa mostró interés y se está definiendo el aporte.",
  "Aceptada": "La empresa confirmó el patrocinio, pero el aporte aún no se recibe.",
  "Donación realizada": "El aporte ya fue entregado y recibido.",
  "Negada": "La empresa indicó que no desea participar.",
};

const ESTADOS_CLASE = {
  "Pendiente de contactar": "e-pendiente",
  "En espera de respuesta": "e-espera",
  "En negociación": "e-negociacion",
  "Aceptada": "e-aceptada",
  "Donación realizada": "e-realizada",
  "Negada": "e-negada",
};

const ASIGNACIONES_DESC = {
  "Pendiente": "El aporte todavía no se ha destinado a ninguna actividad.",
  "Asignado": "Ya se puso a disposición de otro equipo o actividad.",
};

const ESTADOS_EN_PROCESO = [
  "Pendiente de contactar",
  "En espera de respuesta",
  "En negociación",
];

const ESTADO_RECIBIDO = "Donación realizada";

const CAMPOS = [
  "empresa",
  "contacto",
  "responsable",
  "estado",
  "tipo_aporte",
  "descripcion",
  "valor_aproximado",
  "asignacion",
  "observaciones",
];

// ===================== Conexión con Supabase =====================
const API = `${window.CONFIG.SUPABASE_URL}/rest/v1/${window.CONFIG.TABLA}`;
const AUTH = `${window.CONFIG.SUPABASE_URL}/auth/v1`;
const LLAVE_SESION = "patrocinios_sesion";

let sesion = null; // { access_token, refresh_token, expires_at }

function guardarSesion(datos) {
  sesion = {
    access_token: datos.access_token,
    refresh_token: datos.refresh_token,
    expires_at: Date.now() + (datos.expires_in || 3600) * 1000,
  };
  try {
    localStorage.setItem(LLAVE_SESION, JSON.stringify(sesion));
  } catch (e) {
    /* si el navegador bloquea el almacenamiento, la sesión dura solo esta visita */
  }
}

function leerSesion() {
  try {
    const guardado = localStorage.getItem(LLAVE_SESION);
    if (guardado) sesion = JSON.parse(guardado);
  } catch (e) {
    sesion = null;
  }
  return sesion;
}

function borrarSesion() {
  sesion = null;
  try {
    localStorage.removeItem(LLAVE_SESION);
  } catch (e) {
    /* sin efecto */
  }
}

async function iniciarSesion(correo, clave) {
  const res = await fetch(`${AUTH}/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: window.CONFIG.SUPABASE_ANON_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email: correo, password: clave }),
  });
  const datos = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      datos.error_description || datos.msg || "Correo o contraseña incorrectos."
    );
  }
  guardarSesion(datos);
  return sesion;
}

async function renovarSesion() {
  if (!sesion || !sesion.refresh_token) return false;
  const res = await fetch(`${AUTH}/token?grant_type=refresh_token`, {
    method: "POST",
    headers: {
      apikey: window.CONFIG.SUPABASE_ANON_KEY,
      "Content-Type": "application/json",
    },
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
  // Si el permiso está por vencer, se renueva antes de pedir.
  if (sesion && sesion.expires_at && Date.now() > sesion.expires_at - 60000) {
    await renovarSesion();
  }

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
    try {
      const d = await res.json();
      detalle = d.message || d.hint || JSON.stringify(d);
    } catch (e) {
      detalle = `Error ${res.status}`;
    }
    throw new Error(detalle);
  }

  if (res.status === 204) return null;
  const texto = await res.text();
  return texto ? JSON.parse(texto) : null;
}

// ===================== Estado de la aplicación =====================
let estadoActual = "";
let todos = [];        // todos los registros descargados
let visibles = [];     // los que se muestran según pantalla y filtros
let pendienteBorrar = null;

const form = document.getElementById("formulario");
const cuerpoTabla = document.getElementById("cuerpo-tabla");
const vacio = document.getElementById("vacio");
const btnGuardar = document.getElementById("btn-guardar");
const btnCancelar = document.getElementById("btn-cancelar");

// ===================== Utilidades =====================
function escapar(texto) {
  const div = document.createElement("div");
  div.textContent = texto == null ? "" : texto;
  return div.innerHTML;
}

function celda(valor, larga = false) {
  return `<td class="${larga ? "celda-larga" : ""}">${valor ? escapar(valor) : "—"}</td>`;
}

function moneda(valor) {
  if (valor === null || valor === undefined || valor === "") return `<td class="numero">—</td>`;
  return `<td class="numero">₡${Number(valor).toLocaleString("es-CR")}</td>`;
}

function etiquetaEstado(valor) {
  if (!valor) return `<td>—</td>`;
  return `<td><span class="etiqueta-estado ${ESTADOS_CLASE[valor] || ""}">${escapar(valor)}</span></td>`;
}

function mostrarAviso(mensaje, esError = false) {
  const aviso = document.getElementById("aviso");
  aviso.textContent = mensaje;
  aviso.className = "aviso" + (esError ? " error" : "");
  clearTimeout(aviso._t);
  aviso._t = setTimeout(() => aviso.classList.add("oculto"), 3600);
}

function mostrarProblemaConexion(mensaje) {
  const caja = document.getElementById("aviso-conexion");
  caja.innerHTML = `<strong>No hay conexión con la base de datos.</strong> ${escapar(mensaje)}`;
  caja.classList.remove("oculto");
}

function limpiarValor(valor) {
  if (valor === null || valor === undefined) return null;
  const texto = String(valor).trim().replace(/[₡$\s,]/g, "");
  if (!texto) return null;
  const n = Number(texto);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function fechaCorta(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return "";
  return d.toLocaleDateString("es-CR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// ===================== Carga de datos =====================
async function cargar() {
  try {
    const datos = await pedir(`${API}?select=*&order=id.desc`);
    todos = datos || [];
    document.getElementById("aviso-conexion").classList.add("oculto");
    aplicarFiltros();
    actualizarResumen();
  } catch (e) {
    mostrarProblemaConexion(e.message);
  }
}

function aplicarFiltros() {
  const buscar = document.getElementById("f-buscar").value.trim().toLowerCase();
  const responsable = document.getElementById("f-responsable").value.trim().toLowerCase();

  visibles = todos.filter((r) => {
    if (estadoActual && r.estado !== estadoActual) return false;
    if (buscar && !(r.empresa || "").toLowerCase().includes(buscar)) return false;
    if (responsable && !(r.responsable || "").toLowerCase().includes(responsable)) return false;
    return true;
  });

  render();
}

function render() {
  cuerpoTabla.innerHTML = "";
  vacio.classList.toggle("oculto", visibles.length > 0);

  visibles.forEach((r, i) => {
    const tr = document.createElement("tr");
    tr.innerHTML =
      `<td>${visibles.length - i}</td>` +
      celda(r.empresa) +
      celda(r.contacto, true) +
      celda(r.responsable) +
      etiquetaEstado(r.estado) +
      celda(r.tipo_aporte, true) +
      celda(r.descripcion, true) +
      moneda(r.valor_aproximado) +
      celda(r.asignacion) +
      `<td><div class="acciones-fila">
         <button class="btn-secundario" data-accion="editar" data-id="${r.id}">Editar</button>
         <button class="btn-peligro" data-accion="borrar" data-id="${r.id}">Borrar</button>
       </div></td>`;
    cuerpoTabla.appendChild(tr);
  });

  cuerpoTabla.querySelectorAll("[data-accion]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = Number(btn.dataset.id);
      if (btn.dataset.accion === "editar") editar(id);
      else pedirBorrado(id);
    });
  });
}

function actualizarResumen() {
  const porEstado = {};
  ESTADOS.forEach((e) => (porEstado[e] = 0));

  let recibido = 0;
  todos.forEach((r) => {
    if (porEstado[r.estado] !== undefined) porEstado[r.estado]++;
    if (r.estado === ESTADO_RECIBIDO && r.valor_aproximado) {
      recibido += Number(r.valor_aproximado);
    }
  });

  const enProceso = ESTADOS_EN_PROCESO.reduce((s, e) => s + (porEstado[e] || 0), 0);

  document.getElementById("r-total").textContent = todos.length;
  document.getElementById("r-proceso").textContent = enProceso;
  document.getElementById("r-recibidas").textContent = porEstado[ESTADO_RECIBIDO] || 0;
  document.getElementById("r-monto").textContent = "₡" + recibido.toLocaleString("es-CR");

  document.getElementById("c-todos").textContent = todos.length;
  document.querySelectorAll("[data-conteo]").forEach((el) => {
    el.textContent = porEstado[el.dataset.conteo] || 0;
  });
}

// ===================== Formulario =====================
function editar(id) {
  const r = todos.find((x) => x.id === id);
  if (!r) return;

  form.elements["id"].value = r.id;
  CAMPOS.forEach((campo) => {
    if (form.elements[campo]) {
      const v = r[campo];
      form.elements[campo].value = v === null || v === undefined ? "" : v;
    }
  });

  btnCancelar.classList.remove("oculto");
  btnGuardar.textContent = "Guardar cambios";
  document.getElementById("titulo-form").textContent = `Editando: ${r.empresa}`;
  actualizarAyudas();
  document.getElementById("titulo-form").scrollIntoView({ behavior: "smooth", block: "center" });
}

function reiniciar() {
  form.reset();
  form.elements["id"].value = "";
  btnCancelar.classList.add("oculto");
  btnGuardar.textContent = "Guardar registro";
  document.getElementById("titulo-form").textContent = "Agregar registro";
  form.elements["estado"].value = estadoActual || ESTADOS[0];
  actualizarAyudas();
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const empresa = form.elements["empresa"].value.trim();
  if (!empresa) {
    mostrarAviso("El nombre de la empresa es obligatorio.", true);
    return;
  }

  const ahora = new Date().toISOString();
  const datos = { actualizado_en: ahora };
  CAMPOS.forEach((campo) => {
    if (!form.elements[campo]) return;
    const valor = form.elements[campo].value;
    datos[campo] = campo === "valor_aproximado" ? limpiarValor(valor) : String(valor).trim();
  });

  const id = form.elements["id"].value;
  btnGuardar.disabled = true;

  try {
    if (id) {
      await pedir(`${API}?id=eq.${id}`, {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(datos),
      });
    } else {
      datos.creado_en = ahora;
      await pedir(API, {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(datos),
      });
    }

    const estadoGuardado = datos.estado;
    reiniciar();
    await cargar();
    mostrarAviso(
      id
        ? `Registro actualizado. Ahora aparece en "${estadoGuardado}".`
        : `Registro guardado en la pantalla "${estadoGuardado}".`
    );
  } catch (err) {
    mostrarAviso("No se pudo guardar: " + err.message, true);
  } finally {
    btnGuardar.disabled = false;
  }
});

btnCancelar.addEventListener("click", reiniciar);

// ===================== Borrado =====================
function pedirBorrado(id) {
  const r = todos.find((x) => x.id === id);
  pendienteBorrar = id;
  document.getElementById("modal-texto").textContent = r
    ? `¿Seguro que desea eliminar el registro de "${r.empresa}"? Esta acción no se puede deshacer.`
    : "¿Seguro que desea eliminar este registro?";
  document.getElementById("modal-fondo").classList.remove("oculto");
}

document.getElementById("modal-cancelar").addEventListener("click", () => {
  pendienteBorrar = null;
  document.getElementById("modal-fondo").classList.add("oculto");
});

document.getElementById("modal-confirmar").addEventListener("click", async () => {
  if (pendienteBorrar === null) return;
  const id = pendienteBorrar;
  pendienteBorrar = null;
  document.getElementById("modal-fondo").classList.add("oculto");

  try {
    await pedir(`${API}?id=eq.${id}`, { method: "DELETE" });
    await cargar();
    mostrarAviso("Registro eliminado.");
  } catch (e) {
    mostrarAviso("No se pudo eliminar: " + e.message, true);
  }
});

// ===================== Pestañas por estado =====================
function construirPestanas() {
  const nav = document.getElementById("pestanas");
  nav.innerHTML =
    `<button class="pestana activa" data-estado="">Todos <span class="conteo" id="c-todos">0</span></button>` +
    ESTADOS.map(
      (e) =>
        `<button class="pestana" data-estado="${escapar(e)}">${escapar(e)} <span class="conteo" data-conteo="${escapar(e)}">0</span></button>`
    ).join("");

  nav.querySelectorAll(".pestana").forEach((btn) => {
    btn.addEventListener("click", () => {
      nav.querySelectorAll(".pestana").forEach((b) => b.classList.remove("activa"));
      btn.classList.add("activa");
      estadoActual = btn.dataset.estado || "";

      document.getElementById("desc-pantalla").textContent = estadoActual
        ? ESTADOS_DESC[estadoActual] || ""
        : "Todos los registros ingresados.";

      if (!form.elements["id"].value) {
        form.elements["estado"].value = estadoActual || ESTADOS[0];
        actualizarAyudas();
      }
      aplicarFiltros();
    });
  });
}

function llenarSelectEstados() {
  const sel = document.getElementById("select-estado");
  sel.innerHTML = ESTADOS.map((e) => `<option value="${escapar(e)}">${escapar(e)}</option>`).join("");
}

// ===================== Ayudas dinámicas =====================
function actualizarAyudas() {
  const estado = document.getElementById("select-estado").value;
  document.getElementById("ayuda-estado").textContent = ESTADOS_DESC[estado] || "";

  const asignacion = document.getElementById("select-asignacion").value;
  document.getElementById("ayuda-asignacion").textContent = ASIGNACIONES_DESC[asignacion] || "";

  document
    .getElementById("campo-asignacion")
    .classList.toggle("atenuado", estado !== ESTADO_RECIBIDO);
}

// ===================== Descarga de Excel =====================
document.getElementById("btn-excel").addEventListener("click", () => {
  if (typeof XLSX === "undefined") {
    mostrarAviso("No se pudo cargar el generador de Excel. Revise su conexión.", true);
    return;
  }

  const encabezados = [
    "#", "Empresa", "Contacto", "Responsable", "Estado", "Tipo de aporte",
    "Descripción", "Valor aproximado", "Asignación", "Observaciones",
    "Registrado", "Última actualización",
  ];

  const aFilas = (lista) => {
    const filas = [encabezados];
    lista.forEach((r, i) => {
      filas.push([
        i + 1,
        r.empresa || "",
        r.contacto || "",
        r.responsable || "",
        r.estado || "",
        r.tipo_aporte || "",
        r.descripcion || "",
        r.valor_aproximado === null || r.valor_aproximado === undefined
          ? ""
          : Number(r.valor_aproximado),
        r.asignacion || "",
        r.observaciones || "",
        fechaCorta(r.creado_en),
        fechaCorta(r.actualizado_en),
      ]);
    });
    return filas;
  };

  const anchos = [
    { wch: 5 }, { wch: 32 }, { wch: 28 }, { wch: 22 }, { wch: 22 }, { wch: 26 },
    { wch: 34 }, { wch: 18 }, { wch: 14 }, { wch: 30 }, { wch: 13 }, { wch: 18 },
  ];

  const ordenados = [...todos].sort((a, b) => a.id - b.id);
  const wb = XLSX.utils.book_new();

  const agregar = (nombre, lista) => {
    const ws = XLSX.utils.aoa_to_sheet(aFilas(lista));
    ws["!cols"] = anchos;
    ws["!freeze"] = { xSplit: 0, ySplit: 1 };
    XLSX.utils.book_append_sheet(wb, ws, nombre.slice(0, 31));
  };

  agregar("Todos los registros", ordenados);
  ESTADOS.forEach((e) => agregar(e, ordenados.filter((r) => r.estado === e)));

  const hoy = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `Control_Patrocinios_${hoy}.xlsx`);
});

// ===================== Filtros =====================
document.getElementById("f-buscar").addEventListener("input", aplicarFiltros);
document.getElementById("f-responsable").addEventListener("input", aplicarFiltros);
document.getElementById("select-estado").addEventListener("change", actualizarAyudas);
document.getElementById("select-asignacion").addEventListener("change", actualizarAyudas);

// ===================== Ingreso y salida =====================
function mostrarLogin(mensaje) {
  document.getElementById("aplicacion").classList.add("oculto");
  document.getElementById("pantalla-login").classList.remove("oculto");
  const err = document.getElementById("login-error");
  if (mensaje) {
    err.textContent = mensaje;
    err.classList.remove("oculto");
  } else {
    err.classList.add("oculto");
  }
}

function mostrarAplicacion() {
  document.getElementById("pantalla-login").classList.add("oculto");
  document.getElementById("aplicacion").classList.remove("oculto");
}

document.getElementById("form-login").addEventListener("submit", async (e) => {
  e.preventDefault();
  const boton = document.getElementById("btn-entrar");
  const err = document.getElementById("login-error");
  err.classList.add("oculto");
  boton.disabled = true;
  boton.textContent = "Entrando...";

  try {
    await iniciarSesion(
      document.getElementById("login-correo").value.trim(),
      document.getElementById("login-clave").value
    );
    document.getElementById("login-clave").value = "";
    mostrarAplicacion();
    await cargar();
  } catch (error) {
    err.textContent = error.message;
    err.classList.remove("oculto");
  } finally {
    boton.disabled = false;
    boton.textContent = "Entrar";
  }
});

document.getElementById("btn-salir").addEventListener("click", () => {
  borrarSesion();
  todos = [];
  visibles = [];
  mostrarLogin();
});

// ===================== Inicio =====================
async function iniciar() {
  llenarSelectEstados();
  construirPestanas();
  actualizarAyudas();

  if (!window.CONFIG.SUPABASE_ANON_KEY || window.CONFIG.SUPABASE_ANON_KEY.startsWith("PEGAR")) {
    mostrarLogin("Falta configurar la clave de acceso en el archivo config.js.");
    return;
  }

  leerSesion();
  if (sesion && sesion.refresh_token) {
    // Se intenta reutilizar la sesión guardada.
    if (Date.now() > sesion.expires_at - 60000) {
      const ok = await renovarSesion();
      if (!ok) {
        borrarSesion();
        mostrarLogin();
        return;
      }
    }
    mostrarAplicacion();
    await cargar();
  } else {
    mostrarLogin();
  }
}

iniciar();
