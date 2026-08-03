/**
 * host.jsx — ExtendScript carregado pelo CEP via ScriptPath do manifest.
 *
 * O ps-bridge.js envia scripts inline autocontidos, então estas funções não
 * são obrigatórias para o painel funcionar. Elas existem por dois motivos: o
 * manifest do CEP exige um ScriptPath válido, e ter as operações nomeadas aqui
 * facilita depurar pelo console do ExtendScript Toolkit.
 */

/** Lê o foreground atual como "r,g,b" em 0-255. */
function dcGetForeground() {
    var c = app.foregroundColor.rgb;
    return c.red + "," + c.green + "," + c.blue;
}

/** Define o foreground a partir de componentes 0-255. */
function dcSetForeground(r, g, b) {
    var c = new SolidColor();
    c.rgb.red = r;
    c.rgb.green = g;
    c.rgb.blue = b;
    app.foregroundColor = c;
    return "ok";
}

/** Lê o background atual como "r,g,b" em 0-255. */
function dcGetBackground() {
    var c = app.backgroundColor.rgb;
    return c.red + "," + c.green + "," + c.blue;
}

/** Versão do Photoshop hospedeiro, para checagem de compatibilidade. */
function dcHostVersion() {
    return app.version;
}
