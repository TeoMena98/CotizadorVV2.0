const { ipcRenderer } = require("electron");

function parsearRespuesta(texto) {
    const datos = { ida: {}, regreso: {}, precio: null };

    const idaMatch = texto.match(/IDA encontrada:[\s\S]*?Aerolínea: (.*?)\s*Salida: (.*?)\s*Llegada: (.*?)\s*Duración: (.*?)\s*Tipo: (.*)/);
    if (idaMatch) {
        datos.ida = {
            aerolinea: idaMatch[1].trim(),
            salida: idaMatch[2].trim(),
            llegada: idaMatch[3].trim(),
            duracion: idaMatch[4].trim(),
            tipo: idaMatch[5].trim()
        };
    }

    const regresoMatch = texto.match(/REGRESO encontrada:[\s\S]*?Aerolínea: (.*?)\s*Salida: (.*?)\s*Llegada: (.*?)\s*Duración: (.*?)\s*Tipo: (.*)/);
    if (regresoMatch) {
        datos.regreso = {
            aerolinea: regresoMatch[1].trim(),
            salida: regresoMatch[2].trim(),
            llegada: regresoMatch[3].trim(),
            duracion: regresoMatch[4].trim(),
            tipo: regresoMatch[5].trim()
        };
    }

    const precioMatch = texto.match(/Precio: (.*)/);
    if (precioMatch) datos.precio = precioMatch[1].trim();

    return datos;
}


// -------- VALIDACIÓN DE FECHAS --------
const fechaIda = document.getElementById("fechaIda");
const fechaRegreso = document.getElementById("fechaRegreso");

fechaIda.addEventListener("change", () => {
    if (fechaIda.value && fechaRegreso.value <= fechaIda.value) {
        const ida = new Date(fechaIda.value);
        ida.setDate(ida.getDate() + 1);
        fechaRegreso.value = ida.toISOString().split("T")[0];
    }
});

// -------- PASAJEROS Y EDADES --------
function renderEdades(containerId, count, tipo) {
    const cont = document.getElementById(containerId);
    cont.innerHTML = "";

    if (count <= 0) return;

    const wrapper = document.createElement("div");
    wrapper.className = "d-flex flex-wrap gap-3";

    for (let i = 0; i < count; i++) {
        const grupo = document.createElement("div");
        grupo.className = "d-flex flex-column align-items-center";

        const label = document.createElement("label");
        label.textContent = `${tipo} ${i + 1}`;
        label.className = "form-label text-white";
        label.style.fontSize = "0.9rem";

        const input = document.createElement("input");
        input.type = "number";
        input.className = "form-control";
        input.style.width = "60px";

        if (tipo.toLowerCase().includes("niño")) {
            input.min = 2;
            input.max = 17;
            input.value = 3;
        } else if (tipo.toLowerCase().includes("infante")) {
            input.min = 0;
            input.max = 1;
            input.value = 0;
        }

        grupo.appendChild(label);
        grupo.appendChild(input);
        wrapper.appendChild(grupo);
    }

    cont.appendChild(wrapper);
}

document.getElementById("ninos").addEventListener("input", e => {
    renderEdades("edadesNinos", parseInt(e.target.value), "Niño");
});

document.getElementById("infantes").addEventListener("input", e => {
    renderEdades("edadesInfantes", parseInt(e.target.value), "Infante");
});

// -------- MODAL DE PASAJEROS (Google Flights) --------
async function abrirModalPasajeros() {
    const btn = document.querySelector('button[aria-haspopup="dialog"][aria-label*="pasajero"]');
    if (btn) btn.click();
    await new Promise(r => setTimeout(r, 500));
}

async function setPasajeros(etiqueta, cantidad) {
    const fila = Array.from(document.querySelectorAll("li"))
        .find(li => li.textContent.includes(etiqueta));
    if (!fila) return;

    const btnMas = fila.querySelector('button[aria-label*="Agregar"]');
    const btnMenos = fila.querySelector('button[aria-label*="Quitar"]');
    const valorElem = fila.querySelector('span[jsname="NnAfwf"]');

    let actual = parseInt(valorElem.textContent);

    while (actual < cantidad) {
        btnMas.click();
        await new Promise(r => setTimeout(r, 300));
        actual = parseInt(valorElem.textContent);
    }
    while (actual > cantidad) {
        btnMenos.click();
        await new Promise(r => setTimeout(r, 300));
        actual = parseInt(valorElem.textContent);
    }
}

async function cerrarModalPasajeros() {
    const btnListo = Array.from(document.querySelectorAll("button"))
        .find(b => b.textContent.trim() === "Listo");
    if (btnListo) btnListo.click();
    await new Promise(r => setTimeout(r, 500));
}

// -------- FORMULARIO DE BÚSQUEDA --------
document.getElementById("formBusqueda").addEventListener("submit", async (e) => {
    e.preventDefault();

    mostrarLoading();

    let adultos = parseInt(document.getElementById("adultos").value);
    if (adultos < 1) {
        alert("Debe haber al menos 1 adulto.");
        return;
    }

    if (fechaRegreso.value <= fechaIda.value) {
        alert("La fecha de regreso debe ser mayor que la de ida.");
        return;
    }

    const edadesNinos = [...document.querySelectorAll("#edadesNinos input")].map(i => parseInt(i.value));
    let ninosConAsiento = edadesNinos.filter(e => e <= 11).length;
    let nuevosAdultos = edadesNinos.filter(e => e > 11).length;
    adultos += nuevosAdultos;

    const infantes = parseInt(document.getElementById("infantes").value);

    const params = {
        origen: document.getElementById("origen").value,
        destino: document.getElementById("destino").value,
        fechaIda: fechaIda.value,
        fechaRegreso: fechaRegreso.value,
        adultos,
        ninos: ninosConAsiento,
        infantes,
        edadesNinos
    };

    const resultadosDiv = document.getElementById("resultados");

    const respuesta = await ipcRenderer.invoke("buscar-vuelos", params);

    if (respuesta.ok && respuesta.resultados) {
        const vuelos = respuesta.resultados; // 👈 ya es JSON

        // Guardamos en memoria global
        window.ultimaBusqueda = { ...params, vuelos };

        let html = "";
        if (vuelos.ida) {
            html += `
            <div class="card bg-dark text-white p-3 mb-3">
                <h5>✈️ Ida</h5>
                <p><strong>Aerolínea:</strong> ${vuelos.ida.aerolinea}</p>
                <p><strong>Salida:</strong> ${vuelos.ida.salida} - <strong>Llegada:</strong> ${vuelos.ida.llegada}</p>
                <p><strong>Duración:</strong> ${vuelos.ida.duracion}</p>
                <p><strong>Tipo:</strong> ${vuelos.ida.tipo}</p>
            </div>`;
        }
        if (vuelos.regreso) {
            html += `
            <div class="card bg-dark text-white p-3 mb-3">
                <h5>🛬 Regreso</h5>
                <p><strong>Aerolínea:</strong> ${vuelos.regreso.aerolinea}</p>
                <p><strong>Salida:</strong> ${vuelos.regreso.salida} - <strong>Llegada:</strong> ${vuelos.regreso.llegada}</p>
                <p><strong>Duración:</strong> ${vuelos.regreso.duracion}</p>
                <p><strong>Tipo:</strong> ${vuelos.regreso.tipo}</p>
            </div>
            <div class="alert alert-success">
                <strong>💰 Precio total:</strong> ${vuelos.precio}
            </div>`;
        }

        resultadosDiv.innerHTML = html;
        btnCotizacion.classList.remove("d-none");
    } else {
        resultadosDiv.innerHTML = `<p class="text-danger">Error: ${respuesta.error || "No se encontraron vuelos"}</p>`;
        btnCotizacion.classList.add("d-none");
    }

    ocultarLoading();
});

// -------- BOTÓN GENERAR COTIZACIÓN --------
document.getElementById("btnCotizacion").addEventListener("click", async () => {
    // Capturamos los datos del formulario
    if (!window.ultimaBusqueda) {
        alert("❌ No hay vuelos para cotizar");
        return;
    }

    // Añadir teléfono antes de mandar
    window.ultimaBusqueda.telefono = "3001234567";

    const resultado = await ipcRenderer.invoke("generar-cotizacion", window.ultimaBusqueda);
    if (resultado.error) {
        alert("❌ Error: " + resultado.error);
    } else {
        alert("✅ Cotización generada correctamente. PDF guardado.");
    }
});

// -------- VUELO MANUAL --------
document.getElementById("formVueloManual").addEventListener("submit", (e) => {
    e.preventDefault();

    const vuelo = {
        aerolinea: document.getElementById("aerolinea").value,
        horaSalida: document.getElementById("horaSalida").value,
        horaLlegada: document.getElementById("horaLlegada").value,
        precio: document.getElementById("precio").value,
        tipo: document.getElementById("tipoVuelo").value
    };

    const resultadosDiv = document.getElementById("resultados");
    resultadosDiv.innerHTML = `
    <div class="card bg-secondary text-white p-3">
      <h5>✈️ Vuelo manual agregado</h5>
      <p><strong>Aerolínea:</strong> ${vuelo.aerolinea}</p>
      <p><strong>Salida:</strong> ${vuelo.horaSalida} - <strong>Llegada:</strong> ${vuelo.horaLlegada}</p>
      <p><strong>Precio:</strong> COP ${new Intl.NumberFormat("es-CO").format(vuelo.precio)}</p>
      <p><strong>Tipo:</strong> ${vuelo.tipo}</p>
    </div>
  `;

    const modal = bootstrap.Modal.getInstance(document.getElementById("vueloManualModal"));
    modal.hide();
});
