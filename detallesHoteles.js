// detalles_hoteles.js
import { esperar_paneles_habitacion } from "./utils.js";
import {
    aceptar_cookies,
    aplicar_filtros_iniciales,
    aplicar_filtros_todo_incluido,
    obtener_hoteles_ordenados,
    buscar_y_agregar_hotel,
    obtener_trm_actual,
    buscar_hoteles,
} from "./hoteles.js";

/**
 * Obtener la información de un hotel en nueva pestaña
 */
export async function obtener_info_hotel(page, hotelElement) {
    try {
        const enlace = await hotelElement
            .locator(".c-card__button--details")
            .getAttribute("href");
        if (!enlace) return null;

        const [hotelPage] = await Promise.all([
            page.context().waitForEvent("page"),
            page.evaluate((url) => window.open(url, "_blank"), enlace),
        ]);

        const info_habitaciones = [];
        try {
            await hotelPage.waitForSelector("#sheethotelName", { timeout: 10000 });

            const btn_ver_opciones = hotelPage.locator(
                "a:has-text('Ver opciones'), a:has-text('View options')"
            );
            if (await btn_ver_opciones.isVisible()) {
                await btn_ver_opciones.click();
            }

            const ok = await esperar_paneles_habitacion(hotelPage, 15000);
            if (!ok) {
                console.log(
                    `[ADVERTENCIA] No se cargaron habitaciones del hotel: ${await hotelElement.getAttribute(
                        "data-hotelname"
                    )}`
                );
                return null;
            }

            const habitaciones = hotelPage.locator(".hotelCombinationPanel");
            const count = await habitaciones.count();

            for (let i = 0; i < count; i++) {
                try {
                    const hab = habitaciones.nth(i);
                    const hab_nombre = (await hab.locator(".dev-room").textContent()).trim();
                    const plan = (await hab.locator(".dev-mealplan").textContent()).trim();
                    const precioTxt = (
                        await hab.locator(".dev-combination-price p").textContent()
                    ).trim();
                    const precioNum = parseFloat(
                        precioTxt.replace("COP", "").replace("$", "").replace(/\./g, "").replace(",", "").trim()
                    );
                    let cancelacion = "No especificada";
                    try {
                        cancelacion = (
                            await hab.locator(":text-matches('cancelacion','i')").first().textContent()
                        ).trim();
                    } catch { }
                    info_habitaciones.push([hab_nombre, plan, precioNum, cancelacion]);
                } catch {
                    continue;
                }
            }

            return info_habitaciones.length > 0 ? info_habitaciones : null;
        } finally {
            await hotelPage.close();
        }
    } catch {
        return null;
    }
}

/**
 * Mostrar hoteles legible (para debug)
 */
export function mostrar_hoteles_legible(hoteles_info, nombre_hotel = "Hotel") {
    if (hoteles_info && Array.isArray(hoteles_info[0])) {
        hoteles_info = hoteles_info.flat();
    }

    hoteles_info.slice(0, 1).forEach((hab, idx) => {
        try {
            const [nombre_hab, plan, precio, cancelacion_full] = hab;
            const cancelacion_linea =
                cancelacion_full
                    .split("\n")
                    .find((line) => line.toLowerCase().includes("cancel")) || "";
            console.log(
                `[${idx + 1}] ${nombre_hab} - ${plan} - ${precio} - ${cancelacion_linea}`
            );
        } catch (e) {
            console.log(`[ERROR] No se pudo mostrar la habitación: ${hab} -> ${e}`);
        }
    });
}

/**
 * Proceso principal
 */
export async function main(page, options) {
    const {
        URL,
        DESTINO,
        ORIGEN,
        CHECKIN_ddmmyyyy,
        CHECKOUT_ddmmyyyy,
        ADULTOS,
        NINOS,
        noches,
        edades_ninos = [],
        edades_infantes = []
    } = options;

    // --------- Navegar a la URL ---------
    await page.goto(URL, { waitUntil: "load" });
    await aceptar_cookies(page);
    await buscar_hoteles(
        page,
        DESTINO,
        CHECKIN_ddmmyyyy,
        CHECKOUT_ddmmyyyy,
        ADULTOS,
        NINOS,
        edades_ninos,
        edades_infantes
    );

    await page.waitForSelector("div.dev-incremental-completed:has-text('Búsqueda completada')");

    await aplicar_filtros_iniciales(page);
    let lista_hoteles = await obtener_hoteles_ordenados(page, NINOS);

    if (NINOS > 0) {
        lista_hoteles = lista_hoteles.filter(
            (h) => !h[0].toLowerCase().includes("adults only")
        );
    }

    const trm_actual = await obtener_trm_actual();
    let datos = null;

    if (lista_hoteles.length > 0) {
        const hotel_base = await obtener_info_hotel(page, lista_hoteles[0][2]);

        const adicionales = await Promise.all(
            lista_hoteles.slice(1, 3).map((h) => obtener_info_hotel(page, h[2]))
        );

        datos = {
            destino: DESTINO,
            checkin: CHECKIN_ddmmyyyy,
            checkout: CHECKOUT_ddmmyyyy,
            adultos: ADULTOS,
            ninos: NINOS,
            TRM: trm_actual,
            hotel_base: {
                nombre: lista_hoteles[0][0],
                habitaciones: hotel_base.map((hab) => ({
                    habitacion: hab[0],
                    plan: hab[1],
                    precio_num: Math.trunc(hab[2]),
                    precio_str: `$${Math.trunc(hab[2]).toLocaleString()} COP`,
                    cancelacion: hab[3],
                })),
            },
            hoteles_adicionales: adicionales
                .filter(Boolean)
                .map((info, i) => ({
                    nombre: lista_hoteles[i + 1][0],
                    habitaciones: info.map((hab) => ({
                        habitacion: hab[0],
                        plan: hab[1],
                        precio_num: Math.trunc(hab[2]),
                        precio_str: `$${Math.trunc(hab[2]).toLocaleString()} COP`,
                        cancelacion: hab[3],
                    })),
                })),
        };

        const valor_persona = hotel_base[0][2];
        const valor_total = valor_persona * (ADULTOS + NINOS);

        datos.valor_persona = `$${valor_persona.toLocaleString()} COP`;
        datos.valor_total = `$${valor_total.toLocaleString()} COP`;

        const nro_personas = ADULTOS + NINOS;
        const asistencia = 1.2 * nro_personas * noches * trm_actual * 1.15;
        const valor_total_con_asistencia = valor_total + asistencia;

        datos.asistencia = `$${Math.trunc(asistencia).toLocaleString()} COP`;
        datos.valor_total_con_asistencia = `$${Math.trunc(
            valor_total_con_asistencia
        ).toLocaleString()} COP`;
    } else {
        console.log("[ERROR] No se encontraron hoteles tras aplicar filtros iniciales.");
        return null;
    }

    // === TODO INCLUIDO ===
    await aplicar_filtros_todo_incluido(page);
    let lista_ti = await obtener_hoteles_ordenados(page, NINOS);

    if (lista_ti.length > 0) {
        let hoteles_todo_incluido = [];

        for (const h of lista_ti) {
            if (hoteles_todo_incluido.length >= 10) break;
            if (hoteles_todo_incluido.some((ht) => ht.nombre.toLowerCase() === h[0].toLowerCase()))
                continue;

            const info = await obtener_info_hotel(page, h[2]);
            if (!info) continue;

            const primera = info[0];
            hoteles_todo_incluido.push({
                nombre: h[0],
                habitaciones: [
                    {
                        habitacion: primera[0],
                        plan: primera[1],
                        precio_num: Math.trunc(primera[2]),
                        precio_str: `$${Math.trunc(primera[2]).toLocaleString()} COP`,
                        cancelacion: primera[3],
                    },
                ],
            });
        }

        hoteles_todo_incluido.sort((a, b) => a.habitaciones[0].precio_num - b.habitaciones[0].precio_num);
        datos.hoteles_todo_incluido = hoteles_todo_incluido.slice(0, 10);
        return datos;
    } else {
        console.log("[ERROR] No se encontraron hoteles tras aplicar filtros todo incluido.");
        return datos;
    }
}
