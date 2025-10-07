// utils.js
import fs from "fs";
import os from "os";
import path from "path";
import { chromium } from "playwright";
import nunjucks from "nunjucks";

/**
 * Click via JavaScript
 */
export async function js_click(page, locator) {
    const elementHandle = await locator.elementHandle();
    if (elementHandle) {
        await page.evaluate((el) => el.click(), elementHandle);
    }
}

/**
 * Set value with input/change events
 */
export async function js_set_value_and_change(page, locator, value) {
    const elHandle = await locator.elementHandle();
    if (!elHandle) throw new Error("No se pudo obtener el elementHandle");

    await page.evaluate(({ el, val }) => {
        el.value = val;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
    }, { el: elHandle, val: value }); // ✅ pasamos un solo objeto
}




/**
 * Esperar resultados de hoteles
 */
export async function esperar_resultados(page, timeout = 10000) {
    try {
        await page.waitForFunction(
            () =>
                document.querySelectorAll("div.hotel, div.result").length > 0,
            { timeout }
        );
        return await page.locator("div.hotel, div.result").all();
    } catch {
        console.log("[ERROR] No se cargaron resultados a tiempo.");
        return [];
    }
}

/**
 * Obtener ruta absoluta de recurso
 */
export function resource_path(relative_path) {
    const basePath = process.cwd();
    return path.join(basePath, relative_path);
}

/**
 * Parsear vuelo desde texto
 */
export function parse_vuelo(texto, tipo) {
    const vuelo = {};
    const regex = new RegExp(
        `${tipo}:\\s*([^\\n-]*)\\s*-\\s*Aerolínea:\\s*([^\\n-]*)\\s*-\\s*Salida:\\s*([^\\n]*)\\s*Llegada:\\s*([^\\n-]*)\\s*-\\s*Duración:\\s*([^\\n-]*)\\s*-\\s*Tipo:\\s*(.*)`,
        "i"
    );
    const match = texto.match(regex);
    if (match) {
        vuelo.fecha = match[1].trim();
        vuelo.aerolinea = match[2].trim();
        vuelo.hora_salida = match[3].trim();
        vuelo.hora_llegada = match[4].trim();
        vuelo.duracion = match[5].trim();
        vuelo.tipo = match[6].trim();
    } else {
        vuelo.fecha = "";
        vuelo.aerolinea = "";
        vuelo.hora_salida = "";
        vuelo.hora_llegada = "";
        vuelo.duracion = "";
        vuelo.tipo = "";
    }
    return vuelo;
}


/**
 * Generar PDF desde plantilla
 */
const env = new nunjucks.Environment();

// Filtro de moneda (COP con separadores de miles)
env.addFilter("currency", function (num) {
    if (typeof num !== "number") num = parseFloat(num);
    if (isNaN(num)) return num;
    return num.toLocaleString("es-CO", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    });
});

// 👇 helper que encapsula renderString
function renderTemplateString(template, data) {
    return env.renderString(template, data);
}

/**
 * Generar PDF desde plantilla (con Nunjucks)
 */
export async function generar_pdf(datos, telefono) {
    // 1. Cargar plantilla HTML
    const plantilla = resource_path(path.join("templates", "Prueba.html"));
    let template_html = fs.readFileSync(plantilla, "utf-8");

    // 2. Reemplazar rutas de recursos (imágenes, fuentes)
    const reemplazos = {
        "Banner.png": "assets/Banner.png",
        "Vuelos.png": "assets/Vuelos.png",
        "Hoteles.png": "assets/Hoteles.png",
        "Alimentación.png": "assets/Alimentación.png",
        "Traslados.png": "assets/Traslados.png",
        "Asistencia.png": "assets/Asistencia.png",
        "Concierge.png": "assets/Concierge.png",
        "Vuelos seleccionados.png": "assets/Vuelos seleccionados.png",
        "Condiciones.png": "assets/Condiciones.png",
        "Equipo.png": "assets/Equipo.png",
        "./fonts/Caros.otf": "fonts/Caros.otf",
        "./fonts/Caros Medium.otf": "fonts/Caros Medium.otf",
        "./fonts/Caros Bold.otf": "fonts/Caros Bold.otf",
    };

    for (const [original, ruta_relativa] of Object.entries(reemplazos)) {
        const ruta_absoluta = resource_path(ruta_relativa).replace(/\\/g, "/");
        template_html = template_html.replaceAll(original, ruta_absoluta);
    }

    // 3. Renderizar con Nunjucks usando helper
    const resultado_html = renderTemplateString(template_html, datos);

    // 4. Guardar HTML temporal
    const tmpHtmlPath = path.join(os.tmpdir(), `cotizacion_${Date.now()}.html`);
    fs.writeFileSync(tmpHtmlPath, resultado_html, "utf-8");

    // 5. Generar PDF con Playwright
    let telefono_limpio = telefono.replace(/\D/g, "");
    if (!telefono_limpio) telefono_limpio = "0000";
    const carpeta_documentos = path.join(os.homedir(), "Documents");
    const ruta_pdf = path.join(
        carpeta_documentos,
        `cotizacion_generada_${telefono_limpio}.pdf`
    );

    const browser = await chromium.launch();
    const page = await browser.newPage();
    await page.goto(`file:///${tmpHtmlPath}`, { waitUntil: "load" });

    const content_height = await page.evaluate(
        () => document.body.scrollHeight - 1500
    );

    await page.pdf({
        path: ruta_pdf,
        width: "1320px",
        height: `${content_height}px`,
        printBackground: true,
    });

    await browser.close();
    fs.unlinkSync(tmpHtmlPath);

    console.log(`✅ Cotización generada en: ${ruta_pdf}`);
    return ruta_pdf;
}

/**
 * Esperar paneles de habitación
 */
export async function esperar_paneles_habitacion(page, timeout = 10000) {
    try {
        await page.waitForFunction(
            () => document.querySelectorAll(".hotelCombinationPanel").length > 0,
            { timeout }
        );
        return true;
    } catch {
        return false;
    }
}

/**
 * Aceptar cookies
 */
export async function aceptar_cookies(page) {
    try {
        const boton_cookies = page.locator(
            "//button[contains(translate(., 'ACEPTAR', 'aceptar'), 'aceptar') or contains(., 'Aceptar todas')]"
        );
        if (await boton_cookies.isVisible({ timeout: 3000 })) {
            await boton_cookies.click();
            await page.waitForTimeout(500);
        }
    } catch {
        console.log("No apareció el banner de cookies.");
    }
}

/**
 * Obtener TRM actual
 */
export async function obtener_trm_actual() {
    const fecha_hoy = new Date().toISOString().split("T")[0];
    const url = `https://trm-colombia.vercel.app/?date=${fecha_hoy}`;
    try {
        const resp = await fetch(url);
        if (resp.ok) {
            const data = await resp.json();
            if (data?.data?.success) {
                return parseFloat(data.data.value);
            }
        }
    } catch { }
    console.log("No se encontró la TRM, usando 1 como fallback");
    return 1;
}
