import { chromium } from "playwright"; // npm install playwright
import fs from "fs";

function normalizarHora(horaStr) {
    let hora = horaStr.toLowerCase().replace(".", "").replace(" ", "");
    hora = hora.replace("am", "AM").replace("pm", "PM");
    return hora.toUpperCase();
}

function esVueloDirecto(tipoVuelo, textoTarjeta) {
    const t1 = (tipoVuelo || "").toLowerCase();
    const t2 = (textoTarjeta || "").toLowerCase();
    const DIRECTO = ["directo", "sin escalas"];
    const ESCALA = ["escala", "escalas", "parada", "paradas", "boletos separados"];

    if (DIRECTO.some(k => t1.includes(k) || t2.includes(k))) return true;
    if (ESCALA.some(k => t1.includes(k) || t2.includes(k))) return false;
    return true;
}

function formatoDuracion(minutos) {
    if (minutos < 60) return `${minutos} minutos`;
    const horas = Math.floor(minutos / 60);
    const mins = minutos % 60;
    if (mins === 0) return `${horas} hora${horas > 1 ? "s" : ""}`;
    return `${horas} hora${horas > 1 ? "s" : ""} y ${mins} minutos`;
}

async function buscarVuelos(fechaIda, fechaRegreso, adultos, ninos, infantes, edadesNinos, origen, destino) {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    let salidaFinal = [];

    const _p = (txt) => salidaFinal.push(txt);

    await page.goto("https://www.google.com/travel/flights?tfs=CBsQAhoqEgoyMDI1LTA4LTIxag0IAhIJL20vMDF4XzZzcg0IAhIJL20vMDFkenljGioSCjIwMjUtMDgtMjdqDQgCEgkvbS8wMWR6eWNyDQgCEgkvbS8wMXhfNnNAAUgBUgNDT1BwAXpsQ2pSSVZEWmxRbTFxTVdkVFNqaEJRelJDUzFGQ1J5MHRMUzB0TFMwdExTMTJkSFZyT1VGQlFVRkJSMmxOTlRkclJrZzNTSGxCRWdaS1FUVXhNVGNhQ3dqaW5ROFFBQm9EUTA5UU9CeHdqeTg9mAEBsgETGAEgASoNCAMSCS9tLzAxZHp5Yw&tfu=GgA&hl=es-419&gl=CO&sa=X&ved=0CAoQtY0DahgKEwigmoHR_-mOAxUAAAAAHQAAAAAQmQI");

    // === Configurar pasajeros ===
    try {
        const btnPasajeros = await page.waitForSelector(
            'button[aria-haspopup="dialog"][aria-label*="pasajero"]',
            { timeout: 10000 }
        );
        await btnPasajeros.click();
        await page.waitForTimeout(1000);

        async function setPasajeros(etiqueta, cantidad) {
            try {
                const fila = await page.waitForSelector(`li:has(label:has-text("${etiqueta}"))`);
                const btnMas = await fila.$('button[aria-label*="Agregar"]');
                const btnMenos = await fila.$('button[aria-label*="Quitar"]');
                const valorElem = await fila.$('span[jsname="NnAfwf"]');
                let actual = parseInt(await valorElem.innerText());

                while (actual < cantidad) {
                    await btnMas.click();
                    await page.waitForTimeout(300);
                    actual = parseInt(await valorElem.innerText());
                }
                while (actual > cantidad) {
                    await btnMenos.click();
                    await page.waitForTimeout(300);
                    actual = parseInt(await valorElem.innerText());
                }
            } catch { }
        }

        await setPasajeros("Adultos", adultos);
        await setPasajeros("Niños", ninos);
        await setPasajeros("sin asiento", infantes);

        const btnListo = await page.$('//span[text()="Listo"]/ancestor::button');
        if (btnListo) await btnListo.click();
    } catch { }

    // === IATA codes ===
    const ciudadesIATA = {
        bogota: "BOG",
        medellin: "MDE",
        cali: "CLO",
        cartagena: "CTG",
        barranquilla: "BAQ",
        bucaramanga: "BGA",
        leticia: "LET",
        armenia: "AXM",
        pereira: "PEI",
        pasto: "PSO",
        popayan: "PPN",
        "santa marta": "SMR",
        monteria: "MTR",
        riohacha: "RCH",
        mitu: "MVP",
        ibague: "IBE",
        neiva: "NVA"
    };

    function normalizarCiudad(ciudad) {
        if (!ciudad) return "";
        const clean = ciudad.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        return ciudadesIATA[clean] || ciudad;
    }

    origen = normalizarCiudad(origen);
    destino = normalizarCiudad(destino);

    // === Origen y destino ===
    await page.fill('input[aria-label="¿Desde dónde?"]', origen);
    await page.waitForTimeout(1500);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");

    await page.fill('input[aria-label="¿A dónde quieres ir?"]', destino);
    await page.waitForTimeout(1500);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");

    // === Fechas ===
    try {
        const fechaIdaInput = await page.waitForSelector('input[aria-label="Salida"]', { timeout: 10000 });
        await fechaIdaInput.click();
        await page.waitForTimeout(1000);

        const diaIda = await page.waitForSelector(`div[jsname="mG3Az"][data-iso="${fechaIda}"]`, { timeout: 10000 });
        await diaIda.click();
        await page.waitForTimeout(500);

        const diaRegreso = await page.waitForSelector(`div[jsname="mG3Az"][data-iso="${fechaRegreso}"]`, { timeout: 10000 });
        await diaRegreso.click();
        await page.waitForTimeout(500);

        const btnListoFechas = await page.waitForSelector(
            '//div[@jsname="WCieBd"]//button[.//span[text()="Listo"]]',
            { timeout: 10000 }
        );
        await btnListoFechas.click();

        try {
            await page.waitForSelector('ul.Rk10dc > li.pIav2d', { timeout: 10000 });
            await page.waitForTimeout(2000);
        } catch (err) {
            console.error("❌ No cargaron los vuelos en 10s, reiniciando proceso...");
            await browser.close();
            return buscarVuelos(
                fechaIda, fechaRegreso, adultos, ninos, infantes, edadesNinos, origen, destino
            );
        }

    } catch (err) {
        console.error("⚠️ Error al seleccionar las fechas o cargar vuelos:", err.message);
    }

    // === Extraer vuelos de IDA ===
    const vuelosIda = await page.$$('ul.Rk10dc > li.pIav2d');
    let mejoresVuelos = [];
    let mejoresRegresos = [];
    for (let vuelo of vuelosIda) {
        try {
            const textoTarjeta = await vuelo.innerText();
            const horaSalidaRaw = await vuelo.$eval('[aria-label^="Hora de salida"]', el => el.innerText);
            if (!horaSalidaRaw) continue;

            const horaNorm = normalizarHora(horaSalidaRaw);
            const match = horaNorm.match(/(\d+):(\d+)(AM|PM)/);
            if (!match) continue;

            let [_, hh, mm, ampm] = match;
            let hora24 = (parseInt(hh) % 12) + (ampm === "PM" ? 12 : 0);
            if (!(hora24 >= 5 && hora24 < 12)) continue;

            const horaLlegada = await vuelo.$eval('[aria-label^="Hora de llegada"]', el => el.innerText);
            const duracion = await vuelo.$eval('[aria-label^="Duración total"]', el => el.innerText);
            const precio = await vuelo.$eval('span[aria-label*="pesos colombianos"]', el => el.innerText);
            const aerolinea = await vuelo.$eval('.sSHqwe span', el => el.innerText);
            const tipoVuelo = await vuelo.$eval('div[aria-label^="Vuelo"]', el => el.innerText).catch(() => "");

            let duracionMin = 0;
            const hMatch = duracion.match(/(\d+)\s*h/);
            const mMatch = duracion.match(/(\d+)\s*min/);
            if (hMatch) duracionMin += parseInt(hMatch[1]) * 60;
            if (mMatch) duracionMin += parseInt(mMatch[1]);
            if (duracionMin === 0) duracionMin = 9999;

            const precioNum = parseInt(precio.replace(/[^\d]/g, ""), 10);
            const directo = esVueloDirecto(tipoVuelo, textoTarjeta);

            mejoresVuelos.push({
                aerolinea,
                horaSalida: horaSalidaRaw,
                horaLlegada,
                duracionMin,
                precio,
                precioNum,
                directo
            });
        } catch { }
    }

    let mejorIda = null;
    if (mejoresVuelos.length > 0) {
        const candidatos = mejoresVuelos
            .filter(v => v.duracionMin <= 600)
            .sort((a, b) => a.precioNum - b.precioNum || a.duracionMin - b.duracionMin);

        if (candidatos.length > 0) {
            mejorIda = candidatos[0];
            _p("Mejor opción de vuelo IDA encontrada:");
            _p(` Aerolínea: ${mejorIda.aerolinea}`);
            _p(` Salida: ${mejorIda.horaSalida}  Llegada: ${mejorIda.horaLlegada}`);
            _p(` Duración: ${formatoDuracion(mejorIda.duracionMin)}`);
            _p(` Tipo: ${mejorIda.directo ? "Directo" : "Con escala"}`);
        }
    }

    // === Seleccionar vuelo de ida correcto y buscar regreso ===
    if (mejorIda) {
        let hizoClick = false;
        const vuelosLista = await page.$$('ul.Rk10dc > li.pIav2d');

        for (let li of vuelosLista) {
            try {
                const al = await li.$eval('.sSHqwe span', el => el.innerText.trim());
                const hs = await li.$eval('[aria-label^="Hora de salida"]', el => el.innerText.trim());
                const hl = await li.$eval('[aria-label^="Hora de llegada"]', el => el.innerText.trim());

                if (
                    al.startsWith(mejorIda.aerolinea) &&
                    hs.replace(/\s+/g, '') === mejorIda.horaSalida.replace(/\s+/g, '') &&
                    hl.replace(/\s+/g, '') === mejorIda.horaLlegada.replace(/\s+/g, '')
                ) {
                    try {
                        const btn = await li.$('.//button[.//span[normalize-space()="Seleccionar vuelo"]]');
                        if (btn) {
                            await btn.click();
                        } else {
                            await li.click();
                        }
                    } catch {
                        await li.click();
                    }
                    hizoClick = true;
                    break;
                }
            } catch { }
        }

        if (!hizoClick) {
            _p("⚠️ No se pudo identificar el vuelo exacto, seleccionando primer vuelo visible…");
            try {
                const btnFallback = await page.$('(//button[.//span[normalize-space()="Seleccionar vuelo"]])[1]');
                if (btnFallback) await btnFallback.click();
            } catch { }
        }

        // === Esperar sección de regreso ===
        try {
            await page.waitForSelector('//span[normalize-space()="Regreso"]', { timeout: 1000 });
        } catch { await page.waitForTimeout(200); }

        await page.waitForTimeout(100);

        // === Extraer vuelos de regreso ===
        const vuelosRegreso = await page.$$('div.yR1fYc');


        for (let vuelo of vuelosRegreso) {
            try {
                const textoCard = await vuelo.innerText();
                const horaSalida = await vuelo.$eval('[aria-label^="Hora de salida"]', el => el.innerText);
                const horaLlegada = await vuelo.$eval('[aria-label^="Hora de llegada"]', el => el.innerText);
                const duracion = await vuelo.$eval('[aria-label^="Duración total"]', el => el.innerText);
                const precio = await vuelo.$eval('span[aria-label*="pesos colombianos"]', el => el.innerText);
                const aerolinea = await vuelo.$eval('.sSHqwe span', el => el.innerText);
                const tipoVuelo = await vuelo.$eval('div[aria-label^="Vuelo"]', el => el.innerText).catch(() => "");

                const horaNorm = normalizarHora(horaSalida);
                const match = horaNorm.match(/(\d+):(\d+)(AM|PM)/);
                if (!match) continue;
                let [_, hh, mm, ampm] = match;
                let hora24 = (parseInt(hh) % 12) + (ampm === "PM" ? 12 : 0);
                if (hora24 < 12) continue;

                let duracionMin = 0;
                const hMatch = duracion.match(/(\d+)\s*h/);
                const mMatch = duracion.match(/(\d+)\s*min/);
                if (hMatch) duracionMin += parseInt(hMatch[1]) * 60;
                if (mMatch) duracionMin += parseInt(mMatch[1]);
                if (duracionMin === 0) duracionMin = 9999;
                if (duracionMin > 600) continue;

                const precioNum = parseInt(precio.replace(/[^\d]/g, ""), 10);
                const directo = esVueloDirecto(tipoVuelo, textoCard);

                mejoresRegresos.push({
                    aerolinea,
                    horaSalida,
                    horaLlegada,
                    duracionMin,
                    precio,
                    precioNum,
                    directo
                });
            } catch { }
        }

        if (mejoresRegresos.length > 0) {
            mejoresRegresos.sort((a, b) => a.precioNum - b.precioNum || a.duracionMin - b.duracionMin);
            const mejorRegreso = mejoresRegresos[0];

            _p("\nMejor opción de vuelo REGRESO encontrada:");
            _p(` Aerolínea: ${mejorRegreso.aerolinea}`);
            _p(` Salida: ${mejorRegreso.horaSalida}  Llegada: ${mejorRegreso.horaLlegada}`);
            _p(` Duración: ${formatoDuracion(mejorRegreso.duracionMin)}`);
            _p(` Tipo: ${mejorRegreso.directo ? "Directo" : "Con escala"}`);
            _p("\nPRECIO DEL VUELO:");
            _p(` Precio: ${mejorRegreso.precio}`);
        } else {
            _p("\nNo se encontraron vuelos de regreso dentro del límite de 10 horas.");
        }
    }

    let resultadoFinal = {
        ida: null,
        regreso: null,
        precio: null,
        logs: salidaFinal // opcional: por si quieres mostrar los mensajes "debug"
    };

    // === guardar ida ===
    // === guardar ida ===
    if (mejorIda) {
        resultadoFinal.ida = {
            fecha: fechaIda, // 👈 agregar
            aerolinea: mejorIda.aerolinea,
            salida: mejorIda.horaSalida,
            llegada: mejorIda.horaLlegada,
            duracion: formatoDuracion(mejorIda.duracionMin),
            tipo: mejorIda.directo ? "Directo" : "Con escala"
        };
    }

    // === guardar regreso ===
    if (mejoresRegresos && mejoresRegresos.length > 0) {
        const mejorRegreso = mejoresRegresos[0];
        resultadoFinal.regreso = {
            fecha: fechaRegreso, // 👈 agregar
            aerolinea: mejorRegreso.aerolinea,
            salida: mejorRegreso.horaSalida,
            llegada: mejorRegreso.horaLlegada,
            duracion: formatoDuracion(mejorRegreso.duracionMin),
            tipo: mejorRegreso.directo ? "Directo" : "Con escala"
        };
        resultadoFinal.precio = mejorRegreso.precio;
    }

    let resumen = "";
    if (resultadoFinal.ida) {
        resumen += `Vuelo de ida: ${fechaIda} - Aerolínea: ${resultadoFinal.ida.aerolinea} - Salida: ${resultadoFinal.ida.salida} Llegada: ${resultadoFinal.ida.llegada} - Duración: ${resultadoFinal.ida.duracion} - Tipo: ${resultadoFinal.ida.tipo}\n`;
    }
    if (resultadoFinal.regreso) {
        resumen += `Vuelo de regreso: ${fechaRegreso} - Aerolínea: ${resultadoFinal.regreso.aerolinea} - Salida: ${resultadoFinal.regreso.salida} Llegada: ${resultadoFinal.regreso.llegada} - Duración: ${resultadoFinal.regreso.duracion} - Tipo: ${resultadoFinal.regreso.tipo}\n`;
    }
    if (resultadoFinal.precio) {
        resumen += `Precio: ${resultadoFinal.precio}`;
    }

    fs.writeFileSync("payload.json", JSON.stringify({
        resumen,
        precio: resultadoFinal.precio,
        ida: resultadoFinal.ida,
        regreso: resultadoFinal.regreso
    }, null, 2));

    await browser.close();
    return resultadoFinal; // 🔥 ya no es string, ahora es JSON

}

export default buscarVuelos;
