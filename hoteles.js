// hoteles.js
import {
  js_click,
  js_set_value_and_change,
  esperar_resultados,
  esperar_paneles_habitacion,
} from "./utils.js";
import {
  distribuir_huespedes,
  configurar_habitaciones,
} from "./habitaciones.js";
import {
  distribuir_huespedesAdultos,
  configurar_habitacionesAdultos,
} from "./habitacionesAdultos.js";
import { obtener_info_hotel } from "./detallesHoteles.js";

/**
 * Aceptar cookies si aparece el banner
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
 * Buscar hoteles en destino
 */
// Diccionario de destinos: nombre -> código IATA
const DESTINOS_IATA = {
  "punta cana": "PUJ",
  "cancún": "CUN",
  "cartagena": "CTG",
  "medellín": "MDE",
  "bogotá": "BOG"
};

export async function buscar_hoteles(
  page,
  DESTINO, // puede ser nombre de ciudad o código IATA
  CHECKIN_ddmmyyyy,
  CHECKOUT_ddmmyyyy,
  ADULTOS,
  NINOS,
  edades_ninos,
  edades_infantes
) {
  // --- Buscar IATA igual que en Python ---
  const destino_iata = DESTINOS_IATA[DESTINO.toLowerCase()];

 

  // --- Ingresar destino en el input ---
  const dest_input = page.locator("input[id$='destinationOnlyAccommodation_input']");
  await dest_input.fill(""); // equivalente a clear()
  await dest_input.fill(DESTINO);
  await page.waitForTimeout(800);

  try {
    const opcion_destino = page.locator(
      `//tr[@data-item-value and starts-with(@data-item-value,'Destination::') and contains(@data-item-value,'${destino_iata}')]`
    );
    await opcion_destino.click({ timeout: 3000 });
  } catch (e) {
    await dest_input.press("ArrowDown");
    await dest_input.press("Tab");
  }



  // --- Check-in y Check-out ---
  const checkin_input = page.locator("input[id$='departureOnlyAccommodation:input']");
  await js_set_value_and_change(page, checkin_input, CHECKIN_ddmmyyyy);
  await checkin_input.press("Tab");

  const checkout_input = page.locator("input[id$='arrivalOnlyAccommodation:input']");
  await js_set_value_and_change(page, checkout_input, CHECKOUT_ddmmyyyy);
  await checkout_input.press("Tab");
  await page.waitForTimeout(800);

  // --- Configurar habitaciones ---
  try {
    if (parseInt(NINOS) < 2) {
      const habitaciones = distribuir_huespedesAdultos(parseInt(ADULTOS), parseInt(NINOS));
      await configurar_habitacionesAdultos(page, habitaciones, edades_ninos, edades_infantes);
    } else {
      const habitaciones = distribuir_huespedes(parseInt(ADULTOS), parseInt(NINOS));
      await configurar_habitaciones(page, habitaciones, edades_ninos, edades_infantes);
    }
  } catch (e) {
    console.log(`[ADVERTENCIA] No se pudo configurar habitaciones: ${e.message}`);
  }

  // --- Botón Buscar ---
  const buscar_btn = page.locator(
    "//*[self::button or self::a or self::span][contains(translate(., 'BUSCAR', 'buscar'),'buscar')]"
  );
  await js_click(page, buscar_btn);

  // --- Esperar resultados ---
  try {
    const resultados = await page.locator(".hotel-card, .result-item, div[class*='results']").all();
    console.log(`[INFO] Resultados cargados: ${resultados.length} hoteles encontrados`);
    return resultados;
  } catch {
    return esperar_resultados(page);
  }
}

export async function activar_filtro(page, label_text) {
  try {
    if (label_text.toLowerCase() === "cancelacion gratis") {
      const container = page.locator(
        `//span[contains(text(), '${label_text}')]/ancestor::div[contains(@class,'ui-selectbooleancheckbox')]`
      );
      const cb_div = container.locator(".ui-chkbox-box").first();
      await page.evaluate(el => el.click(), await cb_div.elementHandle());
    } else if (
      ["solo alojamiento", "alojamiento y desayuno", "media pensión", "pensión completa", "todo incluido"].includes(
        label_text.toLowerCase()
      )
    ) {
      const container = page.locator(
        `//div[@id='mealPlanFilter']//label[contains(text(), '${label_text}')]`
      ).first();
      const cb_div = container.locator(
        "xpath=./preceding-sibling::div[contains(@class,'ui-chkbox')]/div[contains(@class,'ui-chkbox-box')]"
      );
      await page.evaluate(el => el.click(), await cb_div.elementHandle());
    } else {
      // ⭐ Para filtros como "5 estrellas", "4 estrellas", etc.
      const label_elem = page.locator(
        `//div[@id='categoryFilter']//label[contains(text(), '${label_text}')]`
      ).first();
      const cb_div = label_elem.locator(
        "xpath=./preceding-sibling::div[contains(@class,'ui-chkbox')]/div[contains(@class,'ui-chkbox-box')]"
      );
      await page.evaluate(el => el.click(), await cb_div.elementHandle());
    }

    await page.waitForTimeout(800);
  } catch (e) {
    console.log(`[ERROR] No se pudo activar filtro '${label_text}': ${e}`);
  }
}

/**
 * Desactiva un filtro (si está activo) según el texto de su label
 */
export async function desactivar_filtro(page, label_text) {
  try {
    const label_elem = page.locator(
      `//div[@id='mealPlanFilter']//label[contains(text(), '${label_text}')]`
    ).first();
    const cb_div = label_elem.locator(
      "xpath=./preceding-sibling::div[contains(@class,'ui-chkbox')]/div[contains(@class,'ui-chkbox-box')]"
    );

    const className = await cb_div.getAttribute("class");
    if (className && className.includes("ui-state-active")) {
      await page.evaluate(el => el.click(), await cb_div.elementHandle());
      await page.waitForTimeout(500);
    } else {
      console.log(`• Filtro ya estaba desactivado: ${label_text}`);
    }
  } catch (e) {
    console.log(`[ERROR] No se pudo desactivar filtro '${label_text}': ${e}`);
  }
}

/**
 * Aplica los filtros iniciales (ej: Cancelación gratis, estrellas, etc.)
 */
export async function aplicar_filtros_iniciales(page) {
  const filtros = ["Cancelacion gratis", "5 estrellas", "4 estrellas", "Alojamiento y desayuno"];
  for (const filtro of filtros) {
    await activar_filtro(page, filtro);
    await page.waitForTimeout(5000); // espera después de cada filtro
  }

  return await esperar_resultados(page);
}

/**
 * Cambia de "Alojamiento y desayuno" a "Todo incluido"
 */
export async function aplicar_filtros_todo_incluido(page) {
  await desactivar_filtro(page, "Alojamiento y desayuno");
  await page.waitForTimeout(5000);
  await activar_filtro(page, "Todo incluido");
  await page.waitForTimeout(5000);

  return await esperar_resultados(page);
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
  } catch {}
  console.log("No se encontró la TRM, usando 1 como fallback");
  return 1;
}

/**
 * Obtener lista de hoteles ordenados
 */
export async function obtener_hoteles_ordenados(page, NINOS) {
  const hoteles = await page.locator("//div[contains(@class,'c-card--accommodation--hotel')]").all();
  const lista = [];
  for (const h of hoteles) {
    try {
      const nombre = (await h.getAttribute("data-hotelname")).trim();
      if (NINOS > 0 && nombre.toLowerCase().includes("adults only")) {
        console.log(`❌ Excluido por Adults Only: ${nombre}`);
        continue;
      }
      const enlace = await h.locator(".dev-open-hotel").getAttribute("href");
      lista.push([nombre, enlace, h]);
    } catch (e) {
      console.log("Error leyendo hotel:", e);
      continue;
    }
  }
  return lista;
}

/**
 * Buscar un hotel por nombre y agregarlo a la lista
 */
export async function buscar_y_agregar_hotel(page, nombre_hotel) {
  try {
    const input_filtro = page.locator("input.nameFilter");
    await input_filtro.fill(nombre_hotel);
    await input_filtro.press("Enter");

    await page.waitForTimeout(2000);
    const hayResultados = (await page.locator(".c-card--accommodation--hotel").count()) > 0;
    const noResultados = (await page.locator(".dev-no-result-message").count()) > 0;

    if (noResultados) {
      console.log(`[INFO] No hubo resultados para '${nombre_hotel}' con los filtros actuales.`);
      await input_filtro.fill("");
      await input_filtro.press("Enter");
      return null;
    }

    const lista_filtrada = await obtener_hoteles_ordenados(page, 0);
    if (!lista_filtrada.length) {
      console.log(`[ADVERTENCIA] No se encontró el hotel: ${nombre_hotel}`);
      return null;
    }

    const h = lista_filtrada[0];
    const info = await obtener_info_hotel(page, h[2]);
    if (!info) return null;

    const primera = info[0];
    const hotel_dict = {
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
    };

    await input_filtro.fill("");
    await input_filtro.press("Enter");
    console.log(`[OK] Agregado hotel obligatorio: ${hotel_dict.nombre}`);
    return hotel_dict;
  } catch (e) {
    console.log(`[ERROR] Falló búsqueda directa de ${nombre_hotel}: ${e}`);
    return null;
  }
}
