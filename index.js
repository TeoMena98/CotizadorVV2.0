// index.js (ESM, equivalente a main.py en Python)
import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { generar_pdf, parse_vuelo } from "./utils.js";
import { main } from "./detallesHoteles.js";

// Necesario para __dirname en ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function ensureListFromArg(x) {
    if (!x) return [];
    if (typeof x === "string") {
        try {
            return JSON.parse(x);
        } catch {
            const num = parseInt(x, 10);
            return isNaN(num) ? [] : [num];
        }
    }
    if (Array.isArray(x)) return x;
    return [x];
}

// Helper para formatear fechas como en Python: DD/MM/YYYY
function formatDateDDMMYYYY(date) {
    const d = String(date.getDate()).padStart(2, "0");
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const y = date.getFullYear();
    return `${d}/${m}/${y}`;
}

export async function runCotizacion({
    jsonFile,
    fechaIda,
    fechaRegreso,
    adultos,
    ninos,
    infantes,
    destino,
    origen,
    edadesNinosArg,
    edadesInfantesArg,
    telefono
}) {
    const salidaLogs = [];
    function log(msg) {
        console.log(msg);
        salidaLogs.push(String(msg));
    }

    // ----------- LEER JSON (payload) -----------
    let payload = {};
    try {
        const raw = fs.readFileSync(jsonFile, "utf-8");
        payload = JSON.parse(raw);
    } catch (e) {
        const err = `❌ Error al leer JSON: ${e.message}`;
        log(err);
        return { error: err, logs: salidaLogs.join("\n") };
    }

    const contenidoSalida = payload.resumen || "";
    const precioRaw = String(payload.precio || "0");
    const precioVuelo = parseInt(precioRaw.replace(/[^\d]/g, ""), 10) || 0;
    const precioVueloStr = `$${precioVuelo.toLocaleString("es-CO")} COP`;

    // ----------- NORMALIZAR TIPOS -----------
    adultos = parseInt(adultos, 10);
    ninos = parseInt(ninos, 10);
    infantes = parseInt(infantes, 10);
    const edadesNinos = ensureListFromArg(edadesNinosArg);
    const edadesInfantes = ensureListFromArg(edadesInfantesArg);

    // ----------- FECHAS COMO DD/MM/YYYY -----------
    let CHECKIN_ddmmyyyy, CHECKOUT_ddmmyyyy, noches;
    try {
        const checkinDate = new Date(fechaIda);
        const checkoutDate = new Date(fechaRegreso);

        CHECKIN_ddmmyyyy = formatDateDDMMYYYY(checkinDate);
        CHECKOUT_ddmmyyyy = formatDateDDMMYYYY(checkoutDate);

        noches = Math.floor((checkoutDate - checkinDate) / (1000 * 60 * 60 * 24));
    } catch (e) {
        const err = `❌ Error al parsear fechas: ${e.message}`;
        log(err);
        return { error: err, logs: salidaLogs.join("\n") };
    }

    // ----------- LANZAR NAVEGADOR -----------
    const browser = await chromium.launch({ headless: false });
    const page = await browser.newPage();

    let datos = null;
    try {
        datos = await main(page, {
            URL: "https://viajavipco.paquetedinamico.com/accommodation/onlyAccommodationAvail.xhtml?tripId=1&availPosition=1",
            DESTINO: destino,
            ORIGEN: origen,
            CHECKIN_ddmmyyyy,
            CHECKOUT_ddmmyyyy,
            ADULTOS: adultos,
            NINOS: ninos,
            noches,
            edades_ninos: edadesNinos,
            edades_infantes: edadesInfantes
        });

        if (!datos) {
            log("❌ No se generó ninguna cotización.");
            await browser.close();
            return { error: "No se generó ninguna cotización.", logs: salidaLogs.join("\n") };
        }

        // ----------- AGREGAR INFO DE VUELOS -----------
        datos.vuelo_ida = parse_vuelo(contenidoSalida, "Vuelo de ida");
        datos.vuelo_regreso = parse_vuelo(contenidoSalida, "Vuelo de regreso");

        datos.contenido_salida = contenidoSalida;
        datos.precio_vuelo = precioVuelo;
        datos.precio_vuelo_str = precioVueloStr;
        datos.noches = payload.noches || noches;
        datos.origen = origen;
        datos.destino = destino;


        datos.vuelos = {
            ida: {
                fecha: datos.vuelo_ida?.fecha || "",
                aerolinea: datos.vuelo_ida?.aerolinea || "",
                salida: datos.vuelo_ida?.hora_salida || "",
                llegada: datos.vuelo_ida?.hora_llegada || "",
                duracion: datos.vuelo_ida?.duracion || "",
                tipo: datos.vuelo_ida?.tipo || ""
            },
            regreso: {
                fecha: datos.vuelo_regreso?.fecha || "",
                aerolinea: datos.vuelo_regreso?.aerolinea || "",
                salida: datos.vuelo_regreso?.hora_salida || "",
                llegada: datos.vuelo_regreso?.hora_llegada || "",
                duracion: datos.vuelo_regreso?.duracion || "",
                tipo: datos.vuelo_regreso?.tipo || ""
            },
            precio: datos.precio_vuelo_str
        };

        // ----------- GENERAR PDF -----------
        try {
            const pdfPath = await generar_pdf(datos, telefono);
            log(`✅ PDF generado correctamente en: ${pdfPath}`);
        } catch (e) {
            log("[ERROR] Error generando PDF, vuelve a intentarlo");
            console.error("Detalles técnicos:", e);
        }
    } catch (e) {
        log("[ERROR] Vuelve a intentarlo");
        console.error("Detalles técnicos:", e);
        await browser.close();
        return { error: String(e), logs: salidaLogs.join("\n") };
    }

    await browser.close();

    // Retornar igual que Python: datos + logs
    return { datos, logs: salidaLogs.join("\n") };
}
