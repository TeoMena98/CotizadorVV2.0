import { app, BrowserWindow, ipcMain, Menu } from "electron";
import path from "path";
import { fileURLToPath } from "url";
import buscarVuelos from "./buscarVuelos.js";
import { runCotizacion } from "./index.js"; // 👈 importar tu lógica de cotización

// Necesario para __dirname en ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow;
let ultimaBusqueda = null;
app.on("ready", () => {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    Menu.setApplicationMenu(null);
    mainWindow.loadFile("index.html");
});

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
});

// ----------- BÚSQUEDA DE VUELOS -----------
ipcMain.handle("buscar-vuelos", async (event, params) => {
    try {
        const {
            fechaIda,
            fechaRegreso,
            adultos,
            ninos,
            infantes,
            edadesNinos,
            origen,
            destino
        } = params;

        const resultados = await buscarVuelos(
            fechaIda,
            fechaRegreso,
            adultos,
            ninos,
            infantes,
            edadesNinos,
            origen,
            destino
        );
        ultimaBusqueda = { params, resultados };
        return { ok: true, resultados };
    } catch (err) {
        return { ok: false, error: err.message };
    }
});

// ----------- GENERAR COTIZACIÓN -----------
ipcMain.handle("generar-cotizacion", async (event, params) => {
    try {
        const resultado = await runCotizacion({
            ...params,
            ...ultimaBusqueda,
            jsonFile: "payload.json" // ⚠️ este archivo debe existir o generarse antes
        });
        return resultado;
    } catch (err) {
        return { error: err.message };
    }
});
