using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.Principal;
using Microsoft.Win32;
using System.Threading;
using System.Windows.Forms;

[assembly: AssemblyTitle("DrawColor Installer")]
[assembly: AssemblyDescription("Instalador do Plugin DrawColor para Adobe Photoshop")]
[assembly: AssemblyVersion("1.0.0.0")]

namespace DrawColorInstaller
{
    static class Program
    {
        [STAThread]
        static void Main()
        {
            // Auto-elevar para administrador se necessario
            if (!IsAdministrator())
            {
                try
                {
                    var proc = new ProcessStartInfo
                    {
                        UseShellExecute = true,
                        WorkingDirectory = Environment.CurrentDirectory,
                        FileName = Application.ExecutablePath,
                        Verb = "runas"
                    };
                    Process.Start(proc);
                    return;
                }
                catch
                {
                    MessageBox.Show(
                        "Este instalador precisa de permissoes de Administrador para continuar.\n\nClique com botao direito no .exe e escolha 'Executar como administrador'.",
                        "Permissao Necessaria",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Warning
                    );
                    return;
                }
            }

            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new InstallerForm());
        }

        static bool IsAdministrator()
        {
            try
            {
                var identity = WindowsIdentity.GetCurrent();
                var principal = new WindowsPrincipal(identity);
                return principal.IsInRole(WindowsBuiltInRole.Administrator);
            }
            catch { return false; }
        }
    }

    // =========================================================================
    // FORMULARIO PRINCIPAL
    // =========================================================================
    class InstallerForm : Form
    {
        // -- PALETA DE CORES (padrao Xuimart) ---------------------------------
        static readonly Color BG_DARK     = Color.FromArgb(14, 14, 20);
        static readonly Color BG_CARD     = Color.FromArgb(24, 24, 34);
        static readonly Color BG_PANEL    = Color.FromArgb(32, 32, 46);
        static readonly Color ACCENT      = Color.FromArgb(222, 34, 70);   // vermelho
        static readonly Color ACCENT_DARK = Color.FromArgb(168, 24, 52);
        static readonly Color SUCCESS     = Color.FromArgb(34, 200, 100);
        static readonly Color WARNING     = Color.FromArgb(251, 191, 36);
        static readonly Color ERROR_CLR   = Color.FromArgb(239, 68, 68);
        static readonly Color TEXT_MAIN   = Color.FromArgb(240, 240, 255);
        static readonly Color TEXT_DIM    = Color.FromArgb(140, 140, 165);
        static readonly Color BORDER      = Color.FromArgb(55, 55, 75);
        static readonly Color CYAN_BTN    = Color.FromArgb(0, 200, 200);

        // -- IDENTIFICADORES DO PLUGIN ----------------------------------------
        const string BUNDLE_ID = "com.drawcolor.colorwheel";

        // -- CONTROLES ---------------------------------------------------------
        Panel         pnlLeft, pnlRight, pnlFooter, pnlHeader;
        Label         lblTitle, lblSubtitle, lblVersion, lblStatus, lblPlugin;
        CheckedListBox lstVersions;
        ProgressBar   progressBar;
        RichTextBox   rtbLog;
        Button        btnInstall, btnBackup, btnBrowse, btnPix, btnKofi;
        Label         lblVersionsTitle;

        List<PhotoshopInstallation> foundInstalls = new List<PhotoshopInstallation>();
        BackgroundWorker worker;
        string zipPath;
        WorkerMode _lastWorkerMode;
        int _lastInstalledCount;

        // -- CONSTRUTOR --------------------------------------------------------
        public InstallerForm()
        {
            // Janela
            this.Text            = "Instalador DrawColor v1.0.0";
            this.Size            = new Size(780, 540);
            this.MinimumSize     = new Size(780, 540);
            this.MaximumSize     = new Size(780, 540);
            this.StartPosition   = FormStartPosition.CenterScreen;
            this.BackColor       = BG_DARK;
            this.ForeColor       = TEXT_MAIN;
            this.FormBorderStyle = FormBorderStyle.FixedSingle;
            this.MaximizeBox     = false;
            this.Font            = new Font("Segoe UI", 9f);

            // Icone da janela / barra de tarefas: usa o proprio icone do EXE
            try
            {
                this.Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
            }
            catch { }

            BuildUI();
            this.Load += (s, e) =>
            {
                DetectPhotoshopInstallations();
                FindZipFile();
                ShowChangelogOnce();
            };
        }

        void ShowChangelogOnce()
        {
            string changelog =
                "DrawColor v1.0.0 - Primeira versao:\n\n" +
                "RECURSOS:\n" +
                "  - Roda de cores com triangulo, quadrado e disco\n" +
                "  - Harmonias: complementar, analoga, triade,\n" +
                "    tetrade e split-complementar\n" +
                "  - Gamut Masking com edicao de vertices\n" +
                "  - Sliders RGB, HSV, LAB, CMYK e B/W\n" +
                "  - Mixers de cor com historico\n" +
                "  - Paletas salvaveis\n" +
                "  - Gode (mistura de tintas)\n" +
                "  - Layout customizavel com editor visual\n" +
                "  - Painel de ferramentas separado\n\n" +
                "Desenvolvido por Xuimart\n" +
                "Apoie: https://livepix.gg/xuimart";
            MessageBox.Show(
                changelog,
                "Novidades do DrawColor v1.0.0",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information
            );
        }

        void BuildUI()
        {
            // -- CABECALHO (faixa escura no topo) ------------------------------
            pnlHeader = new Panel
            {
                Dock      = DockStyle.Top,
                Height    = 72,
                BackColor = Color.FromArgb(10, 10, 16)
            };
            this.Controls.Add(pnlHeader);

            lblTitle = new Label
            {
                Text      = "DRAWCOLOR",
                Font      = new Font("Segoe UI", 22f, FontStyle.Bold),
                ForeColor = TEXT_MAIN,
                Location  = new Point(20, 10),
                AutoSize  = true
            };
            pnlHeader.Controls.Add(lblTitle);

            lblSubtitle = new Label
            {
                Text      = "Roda de Cores para Adobe Photoshop",
                Font      = new Font("Segoe UI", 9f, FontStyle.Regular),
                ForeColor = ACCENT,
                Location  = new Point(22, 46),
                AutoSize  = true
            };
            pnlHeader.Controls.Add(lblSubtitle);

            // separador horizontal sob header
            var sepH = new Panel { Dock = DockStyle.Top, Height = 1, BackColor = BORDER };
            this.Controls.Add(sepH);

            // -- RODAPE --------------------------------------------------------
            pnlFooter = new Panel
            {
                Dock      = DockStyle.Bottom,
                Height    = 50,
                BackColor = Color.FromArgb(10, 10, 16)
            };
            this.Controls.Add(pnlFooter);

            var sepF = new Panel { Dock = DockStyle.Top, Height = 1, BackColor = BORDER };
            pnlFooter.Controls.Add(sepF);

            var lblCredit = new Label
            {
                Text      = "Desenvolvido por Xuimart",
                Font      = new Font("Segoe UI", 8.5f),
                ForeColor = TEXT_DIM,
                Location  = new Point(14, 16),
                AutoSize  = true
            };
            pnlFooter.Controls.Add(lblCredit);

            lblVersion = new Label
            {
                Text      = "v1.0.0",
                Font      = new Font("Segoe UI", 8.5f, FontStyle.Bold),
                ForeColor = TEXT_DIM,
                Location  = new Point(720, 16),
                AutoSize  = true
            };
            pnlFooter.Controls.Add(lblVersion);

            btnPix = CreateFlatButton("Pix", CYAN_BTN, Color.FromArgb(0, 160, 160), new Point(556, 10), new Size(85, 28));
            btnPix.Click += (s, e) => MessageBox.Show("Obrigado pelo apoio!\nChave Pix: pix@xuimart.com", "Apoiar via Pix", MessageBoxButtons.OK, MessageBoxIcon.Information);
            pnlFooter.Controls.Add(btnPix);

            btnKofi = CreateFlatButton("Ko-fi", Color.FromArgb(41, 171, 226), Color.FromArgb(20, 130, 180), new Point(648, 10), new Size(64, 28));
            btnKofi.Click += (s, e) => { try { System.Diagnostics.Process.Start("https://ko-fi.com"); } catch { } };
            pnlFooter.Controls.Add(btnKofi);

            // -- PAINEL ESQUERDO (Recursos) ------------------------------------
            pnlLeft = new Panel
            {
                Location  = new Point(0, 73),
                Size      = new Size(390, 417),
                BackColor = BG_DARK
            };
            this.Controls.Add(pnlLeft);

            var lblRecTitle = new Label
            {
                Text      = "Recursos",
                Font      = new Font("Segoe UI", 10.5f, FontStyle.Bold),
                ForeColor = ACCENT,
                Location  = new Point(16, 12),
                AutoSize  = true
            };
            pnlLeft.Controls.Add(lblRecTitle);

            // Separador vermelho
            var sepRed = new Panel { Location = new Point(16, 34), Size = new Size(340, 1), BackColor = Color.FromArgb(80, 222, 34, 70) };
            pnlLeft.Controls.Add(sepRed);

            // Recursos da v1.0.0
            var features = new[]
            {
                new[]{ "\u25CF", "Roda de Cores",        "Triangulo, quadrado e disco"              },
                new[]{ "\u25D0", "Harmonias",            "Complementar, analoga, triade e mais"     },
                new[]{ "\u25B2", "Gamut Masking",        "Mascaras com edicao de vertices"          },
                new[]{ "\u2261", "Sliders Completos",    "RGB, HSV, LAB, CMYK e B/W"                },
                new[]{ "\u25C9", "Mixers de Cor",        "Misturas com historico de resultados"     },
                new[]{ "\u25A6", "Paletas",              "Salve e reutilize suas cores"             },
                new[]{ "\u2740", "Gode",                 "Mistura de tintas como na paleta real"    },
                new[]{ "\u229E", "Layout Customizavel",  "Editor visual e painel de ferramentas"    },
            };

            int y = 44;
            foreach (var f in features)
            {
                var row = new Panel { Location = new Point(14, y), Size = new Size(358, 40), BackColor = Color.Transparent };

                var icon = new Label
                {
                    Text     = f[0],
                    Font     = new Font("Segoe UI", 13f),
                    Location = new Point(0, 6),
                    Size     = new Size(34, 30),
                    TextAlign = ContentAlignment.MiddleCenter
                };

                var title = new Label
                {
                    Text      = f[1],
                    Font      = new Font("Segoe UI", 9.5f, FontStyle.Bold),
                    ForeColor = TEXT_MAIN,
                    Location  = new Point(38, 2),
                    AutoSize  = true
                };

                var sub = new Label
                {
                    Text      = "- " + f[2],
                    Font      = new Font("Segoe UI", 8.5f),
                    ForeColor = TEXT_DIM,
                    Location  = new Point(38, 20),
                    AutoSize  = true
                };

                row.Controls.Add(icon);
                row.Controls.Add(title);
                row.Controls.Add(sub);
                pnlLeft.Controls.Add(row);
                y += 38;
            }

            // -- SEPARADOR VERTICAL --------------------------------------------
            var sepV = new Panel { Location = new Point(389, 73), Size = new Size(1, 417), BackColor = BORDER };
            this.Controls.Add(sepV);

            // -- PAINEL DIREITO (Versoes + Instalar) ---------------------------
            pnlRight = new Panel
            {
                Location  = new Point(390, 73),
                Size      = new Size(390, 417),
                BackColor = BG_DARK
            };
            this.Controls.Add(pnlRight);

            lblVersionsTitle = new Label
            {
                Text      = "Versoes Detectadas",
                Font      = new Font("Segoe UI", 10.5f, FontStyle.Bold),
                ForeColor = ACCENT,
                Location  = new Point(16, 12),
                AutoSize  = true
            };
            pnlRight.Controls.Add(lblVersionsTitle);

            var sepRed2 = new Panel { Location = new Point(16, 34), Size = new Size(354, 1), BackColor = Color.FromArgb(80, 222, 34, 70) };
            pnlRight.Controls.Add(sepRed2);

            lstVersions = new CheckedListBox
            {
                Location      = new Point(16, 44),
                Size          = new Size(354, 150),
                BackColor     = BG_CARD,
                ForeColor     = TEXT_MAIN,
                Font          = new Font("Segoe UI", 10f),
                BorderStyle   = BorderStyle.FixedSingle,
                CheckOnClick  = true
            };
            lstVersions.ItemCheck += (s, e) =>
            {
                this.BeginInvoke((MethodInvoker)UpdateButtonState);
            };
            pnlRight.Controls.Add(lstVersions);

            // Botao PROCURAR (Browse - permite selecionar manualmente)
            btnBrowse = CreateFlatButton("Procurar...", BG_PANEL, BORDER, new Point(16, 198), new Size(354, 28));
            btnBrowse.Font = new Font("Segoe UI", 8.5f, FontStyle.Bold);
            btnBrowse.Click += BtnBrowse_Click;
            pnlRight.Controls.Add(btnBrowse);

            // Botao INSTALAR (grande, vermelho)
            btnInstall = new FlatButton
            {
                Text      = "INSTALAR",
                Location  = new Point(16, 234),
                Size      = new Size(354, 50),
                BackColor = ACCENT,
                HoverColor = ACCENT_DARK,
                ForeColor = Color.White,
                Font      = new Font("Segoe UI", 14f, FontStyle.Bold),
                FlatStyle = FlatStyle.Flat,
                Cursor    = Cursors.Hand,
                Enabled   = false
            };
            ((FlatButton)btnInstall).FlatAppearance.BorderSize = 0;
            btnInstall.Click += BtnInstall_Click;
            pnlRight.Controls.Add(btnInstall);

            // Label de status do plugin (ex: "Plugin embutido encontrado (5 MB).")
            lblPlugin = new Label
            {
                Text      = "Procurando plugin...",
                Font      = new Font("Segoe UI", 8.5f, FontStyle.Italic),
                ForeColor = TEXT_DIM,
                Location  = new Point(16, 290),
                Size      = new Size(354, 18)
            };
            pnlRight.Controls.Add(lblPlugin);

            // Barra de progresso
            progressBar = new ProgressBar
            {
                Location  = new Point(16, 312),
                Size      = new Size(354, 14),
                Style     = ProgressBarStyle.Continuous,
                BackColor = BG_PANEL,
                ForeColor = ACCENT,
                Minimum   = 0,
                Maximum   = 100,
                Value     = 0
            };
            pnlRight.Controls.Add(progressBar);

            // Log de instalacao (menor, compacto)
            rtbLog = new RichTextBox
            {
                Location    = new Point(16, 330),
                Size        = new Size(354, 52),
                BackColor   = BG_CARD,
                ForeColor   = TEXT_DIM,
                Font        = new Font("Consolas", 8f),
                BorderStyle = BorderStyle.None,
                ReadOnly    = true,
                ScrollBars  = RichTextBoxScrollBars.Vertical
            };
            pnlRight.Controls.Add(rtbLog);

            // Botao Backup (pequeno, discreto)
            btnBackup = CreateFlatButton("Backup", BG_PANEL, BORDER, new Point(16, 385), new Size(80, 22));
            btnBackup.Font = new Font("Segoe UI", 7.5f);
            btnBackup.Click += BtnBackup_Click;
            pnlRight.Controls.Add(btnBackup);

            lblStatus = new Label
            {
                Text      = "Pronto",
                Font      = new Font("Segoe UI", 8f, FontStyle.Italic),
                ForeColor = TEXT_DIM,
                Location  = new Point(104, 388),
                AutoSize  = true
            };
            pnlRight.Controls.Add(lblStatus);

            // BackgroundWorker
            worker = new BackgroundWorker();
            worker.WorkerReportsProgress = true;
            worker.DoWork             += Worker_DoWork;
            worker.ProgressChanged    += Worker_ProgressChanged;
            worker.RunWorkerCompleted += Worker_RunWorkerCompleted;
        }

        Button CreateFlatButton(string text, Color backColor, Color hoverColor, Point loc, Size size)
        {
            var btn = new FlatButton
            {
                Text = text,
                Location = loc,
                Size = size,
                BackColor = backColor,
                HoverColor = hoverColor,
                ForeColor = Color.White,
                Font = new Font("Segoe UI", 9, FontStyle.Bold),
                FlatStyle = FlatStyle.Flat,
                Cursor = Cursors.Hand
            };
            btn.FlatAppearance.BorderSize = 0;
            return btn;
        }

        // -- DETECCAO DO PHOTOSHOP --------------------------------------------
        void DetectPhotoshopInstallations()
        {
            foundInstalls.Clear();
            lstVersions.Items.Clear();

            // 1) Scan Program Files directories
            ScanProgramFiles();

            // 2) Scan Windows Registry for non-standard installs
            ScanRegistry(@"SOFTWARE\Adobe\Photoshop", RegistryView.Registry64);
            ScanRegistry(@"SOFTWARE\Adobe\Photoshop", RegistryView.Registry32);
            ScanRegistry(@"SOFTWARE\Adobe\Adobe Photoshop", RegistryView.Registry64);
            ScanRegistry(@"SOFTWARE\Adobe\Adobe Photoshop", RegistryView.Registry32);

            // 3) Deduplicate by BasePath (case-insensitive)
            foundInstalls = foundInstalls
                .GroupBy(i => i.BasePath.ToLowerInvariant())
                .Select(g => g.First())
                .ToList();

            // Populate the checklist
            foreach (var install in foundInstalls)
            {
                string status = install.HasPlugin ? " [instalado]" : " [nao instalado]";
                lstVersions.Items.Add(install.Name + status);
            }

            if (foundInstalls.Count == 0)
            {
                lstVersions.Items.Add("Nenhum Photoshop encontrado");
                Log("AVISO: Nenhuma instalacao do Photoshop foi encontrada.", WARNING);
                Log("Use o botao 'Procurar...' para selecionar manualmente.", TEXT_DIM);
            }
            else
            {
                // Marcar todos por padrao
                for (int i = 0; i < lstVersions.Items.Count; i++)
                    lstVersions.SetItemChecked(i, true);

                Log(string.Format("Encontradas {0} instalacao(oes) do Photoshop.", foundInstalls.Count), SUCCESS);
                foreach (var inst in foundInstalls)
                    Log(string.Format("  \u2022 {0}  [{1}]", inst.Name, inst.HasPlugin ? "ja instalado" : "nao instalado"), TEXT_DIM);
            }

            UpdateButtonState();
        }

        void ScanProgramFiles()
        {
            string[] programDirs = {
                Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
                Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),
            };

            foreach (var programDir in programDirs)
            {
                if (!Directory.Exists(programDir)) continue;

                try
                {
                    foreach (var dir in Directory.GetDirectories(programDir, "Adobe"))
                    {
                        foreach (var psDir in Directory.GetDirectories(dir, "Adobe Photoshop*"))
                        {
                            AddInstallIfValid(psDir);
                        }
                    }
                }
                catch { }
            }
        }

        void ScanRegistry(string subKeyPath, RegistryView view)
        {
            try
            {
                using (var hklm = RegistryKey.OpenBaseKey(RegistryHive.LocalMachine, view))
                using (var adobeKey = hklm.OpenSubKey(subKeyPath))
                {
                    if (adobeKey == null) return;

                    foreach (var versionName in adobeKey.GetSubKeyNames())
                    {
                        try
                        {
                            using (var versionKey = adobeKey.OpenSubKey(versionName))
                            {
                                if (versionKey == null) continue;

                                // Try common value names for install path
                                string installPath = versionKey.GetValue("ApplicationPath") as string
                                    ?? versionKey.GetValue("Path") as string
                                    ?? versionKey.GetValue("InstallPath") as string;

                                if (!string.IsNullOrEmpty(installPath) && Directory.Exists(installPath))
                                {
                                    // Normalize trailing separator
                                    installPath = installPath.TrimEnd('\\', '/');
                                    AddInstallIfValid(installPath);
                                }
                            }
                        }
                        catch { }
                    }
                }
            }
            catch { }
        }

        void AddInstallIfValid(string psDir)
        {
            if (!Directory.Exists(psDir)) return;

            var cepPath = Path.Combine(psDir, "Required", "CEP", "extensions");

            var install = new PhotoshopInstallation
            {
                Name        = Path.GetFileName(psDir),
                BasePath    = psDir,
                CepPath     = cepPath,
                HasPlugin   = Directory.Exists(Path.Combine(cepPath, BUNDLE_ID)),
            };
            foundInstalls.Add(install);
        }

        // -- BROWSE MANUAL (selecao de pasta) ---------------------------------
        void BtnBrowse_Click(object sender, EventArgs e)
        {
            using (var dialog = new FolderBrowserDialog())
            {
                dialog.Description = "Selecione a pasta de instalacao do Adobe Photoshop";
                dialog.ShowNewFolderButton = false;

                if (dialog.ShowDialog() == DialogResult.OK)
                {
                    string selected = dialog.SelectedPath;

                    // Validate: must contain Plug-ins subfolder
                    if (Directory.Exists(Path.Combine(selected, "Plug-ins")))
                    {
                        // Check if already in the list (dedup)
                        bool alreadyExists = foundInstalls.Exists(
                            i => i.BasePath.Equals(selected, StringComparison.OrdinalIgnoreCase));

                        if (alreadyExists)
                        {
                            MessageBox.Show(
                                "Esta instalacao ja esta na lista.",
                                "Aviso",
                                MessageBoxButtons.OK,
                                MessageBoxIcon.Information);
                            return;
                        }

                        AddInstallIfValid(selected);

                        // Refresh the checklist
                        var lastInstall = foundInstalls[foundInstalls.Count - 1];
                        string status = lastInstall.HasPlugin ? " [instalado]" : " [nao instalado]";

                        // Remove placeholder if present
                        if (lstVersions.Items.Count == 1 &&
                            lstVersions.Items[0].ToString() == "Nenhum Photoshop encontrado")
                        {
                            lstVersions.Items.Clear();
                        }

                        lstVersions.Items.Add(lastInstall.Name + status);
                        lstVersions.SetItemChecked(lstVersions.Items.Count - 1, true);

                        Log(string.Format("Instalacao adicionada manualmente: {0}", lastInstall.Name), SUCCESS);
                        UpdateButtonState();
                    }
                    else
                    {
                        MessageBox.Show(
                            "Pasta selecionada nao contem subpasta 'Plug-ins'.\n\n" +
                            "Selecione a pasta raiz do Adobe Photoshop\n" +
                            "(ex: C:\\Program Files\\Adobe\\Adobe Photoshop 2024).",
                            "Pasta Invalida",
                            MessageBoxButtons.OK,
                            MessageBoxIcon.Warning);
                    }
                }
            }
        }

        void FindZipFile()
        {
            // 1) Verificar se o plugin esta embutido no proprio exe (resource)
            // O nome do recurso deve corresponder exatamente ao nome usado na compilacao
            // via /resource:arquivo.zip,nome_do_recurso no build_installer.ps1
            const string RESOURCE_NAME = "drawcolor_plugin.zip";

            try
            {
                var asm = System.Reflection.Assembly.GetExecutingAssembly();
                System.IO.Stream stream = asm.GetManifestResourceStream(RESOURCE_NAME);

                // Fallback: tentar localizar o recurso por busca parcial no manifesto
                // (cobre casos em que o namespace muda o nome real do recurso)
                if (stream == null)
                {
                    var resourceNames = asm.GetManifestResourceNames();
                    foreach (var resName in resourceNames)
                    {
                        if (resName.EndsWith(".zip", StringComparison.OrdinalIgnoreCase))
                        {
                            stream = asm.GetManifestResourceStream(resName);
                            if (stream != null)
                            {
                                Log("Recurso encontrado com nome alternativo: " + resName, WARNING);
                                break;
                            }
                        }
                    }
                }

                if (stream != null)
                {
                    using (stream)
                    {
                        var tmpPath = Path.Combine(Path.GetTempPath(), "drawcolor_plugin_install.zip");
                        using (var fs = File.Create(tmpPath))
                            stream.CopyTo(fs);
                        zipPath = tmpPath;
                        var sizeMB = new FileInfo(zipPath).Length / 1024 / 1024;
                        if (lblPlugin != null) lblPlugin.Text = "Plugin 100% embutido no EXE (" + sizeMB + " MB).";
                        Log("Plugin carregado do instalador (v1.0.0 100% embutido).", Color.FromArgb(0,200,100));
                        UpdateButtonState();
                        return;
                    }
                }
                else
                {
                    Log("Recurso embutido '" + RESOURCE_NAME + "' nao encontrado no EXE. Tentando disco...", WARNING);
                }
            }
            catch (Exception ex)
            {
                Log("Erro ao ler recurso embutido: " + ex.Message + ". Tentando disco...", WARNING);
            }

            // 2) Fallback: procurar o zip na mesma pasta do exe
            var exeDir = Path.GetDirectoryName(Application.ExecutablePath);
            var candidates = new[] {
                Path.Combine(exeDir, "drawcolor_plugin.zip"),
                Path.Combine(exeDir, "drawcolor_files.zip"),
                Path.Combine(exeDir, "plugin_files.zip"),
            };

            foreach (var c in candidates)
            {
                if (File.Exists(c)) { zipPath = c; break; }
            }

            if (zipPath == null)
            {
                // 3) Nenhuma fonte de plugin encontrada - erro descritivo e abortar graciosamente
                string errorMsg =
                    "O plugin DrawColor nao foi encontrado!\n\n" +
                    "O instalador tentou:\n" +
                    "1. Carregar o plugin embutido no EXE (recurso '" + RESOURCE_NAME + "')\n" +
                    "2. Procurar o ZIP na mesma pasta do instalador\n\n" +
                    "Nenhuma das fontes estava disponivel.\n\n" +
                    "Solucao: Coloque o arquivo 'drawcolor_plugin.zip' na mesma pasta\n" +
                    "do instalador e tente novamente.\n\n" +
                    "Pasta atual: " + exeDir;

                if (lblPlugin != null) lblPlugin.Text = "ERRO: Plugin nao encontrado. Veja o log.";
                Log("ERRO CRITICO: Plugin nao encontrado em nenhuma fonte.", ERROR_CLR);
                Log("  Recurso embutido esperado: " + RESOURCE_NAME, TEXT_DIM);
                Log("  Pasta do instalador: " + exeDir, TEXT_DIM);

                MessageBox.Show(
                    errorMsg,
                    "Plugin Nao Encontrado",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error
                );
            }
            else
            {
                var sizeMB = new FileInfo(zipPath).Length / 1024 / 1024;
                if (lblPlugin != null) lblPlugin.Text = "Plugin encontrado em disco (" + sizeMB + " MB).";
                Log("Plugin encontrado em disco: " + Path.GetFileName(zipPath) + " (" + sizeMB + " MB)", Color.FromArgb(0,200,100));
            }

            UpdateButtonState();
        }

        void UpdateButtonState()
        {
            bool running = worker.IsBusy;
            bool hasSelection = lstVersions.CheckedIndices.Count > 0;
            bool hasZip = zipPath != null && File.Exists(zipPath);

            btnInstall.Enabled = hasSelection && hasZip && !running;
            btnBackup.Enabled  = hasSelection && !running;
            btnBrowse.Enabled  = !running;
            lstVersions.Enabled = !running;

            if (running)
            {
                btnInstall.BackColor = Color.Gray;
                btnBackup.BackColor  = Color.Gray;
                btnBrowse.BackColor  = Color.Gray;
            }
            else
            {
                btnInstall.BackColor = btnInstall.Enabled ? ACCENT : Color.FromArgb(80, 30, 40);
                btnBackup.BackColor  = btnBackup.Enabled ? BG_PANEL : Color.FromArgb(50, 50, 60);
                btnBrowse.BackColor  = BG_PANEL;
            }
        }

        List<PhotoshopInstallation> GetSelectedInstalls()
        {
            var result = new List<PhotoshopInstallation>();
            foreach (int idx in lstVersions.CheckedIndices)
            {
                if (idx >= 0 && idx < foundInstalls.Count)
                    result.Add(foundInstalls[idx]);
            }
            return result;
        }

        // -- ENUMS -------------------------------------------------------------
        enum WorkerMode { Install, Backup, Restore }
        class WorkerArgs { public WorkerMode Mode; public List<PhotoshopInstallation> Targets; }

        // -- BACKGROUND WORKER -------------------------------------------------
        void Worker_DoWork(object sender, DoWorkEventArgs e)
        {
            var args = (WorkerArgs)e.Argument;
            var bw = (BackgroundWorker)sender;

            DoWork(args.Mode, args.Targets, bw);
        }

        void Worker_ProgressChanged(object sender, ProgressChangedEventArgs e)
        {
            if (e.ProgressPercentage == -1)
            {
                var entry = (LogEntry)e.UserState;
                Log(entry.Text, entry.Color);
            }
            else
            {
                progressBar.Value = Math.Min(100, Math.Max(0, e.ProgressPercentage));
            }
        }

        void Worker_RunWorkerCompleted(object sender, RunWorkerCompletedEventArgs e)
        {
            SetStatus("Concluido");
            progressBar.Value = 100;
            DetectPhotoshopInstallations();
            UpdateButtonState();
            Log("\n==========================================", BORDER);
            Log("PROCESSO CONCLUIDO COM SUCESSO!", SUCCESS);
            Log("==========================================", BORDER);

            if (_lastWorkerMode == WorkerMode.Install)
                ShowSuccessScreen(_lastInstalledCount);
        }

        void DoWork(WorkerMode mode, List<PhotoshopInstallation> targets, BackgroundWorker bw)
        {
            int step = 100 / targets.Count;
            for (int i = 0; i < targets.Count; i++)
            {
                var inst = targets[i];
                int progBase = i * step;
                int progEnd  = (i + 1) * step;

                ReportLog(bw, string.Format("\nProcessando: {0}", inst.Name), TEXT_MAIN);
                ReportLog(bw, "------------------------------------------", BORDER);

                if (mode == WorkerMode.Install)
                {
                    try { DoInstall(inst, bw, progBase, progEnd); }
                    catch (Exception ex)
                    {
                        ReportLog(bw, "ERRO na instalacao: " + ex.Message, ERROR_CLR);
                        ReportLog(bw, ex.StackTrace, TEXT_DIM);
                    }
                }
                else if (mode == WorkerMode.Backup)
                {
                    try { DoBackup(inst, bw, progBase, progEnd); }
                    catch (Exception ex) { ReportLog(bw, "ERRO no backup: " + ex.Message, ERROR_CLR); }
                }
                else if (mode == WorkerMode.Restore)
                {
                    try { DoRestore(inst, bw, progBase, progEnd); }
                    catch (Exception ex) { ReportLog(bw, "ERRO na restauracao: " + ex.Message, ERROR_CLR); }
                }
            }
        }

        // -- INSTALACAO --------------------------------------------------------
        void DoInstall(PhotoshopInstallation inst, BackgroundWorker bw, int progBase, int progEnd)
        {
            ReportLog(bw, "  Ativando modo debug do CEP (HKCU + HKLM)...", TEXT_DIM);
            EnableCepDebugMode(bw);

            ReportLog(bw, "  Criando backup automatico...", TEXT_DIM);
            DoBackup(inst, bw, progBase, progBase + (progEnd - progBase) / 4);

            ReportLog(bw, "  Extraindo arquivos do plugin...", TEXT_DIM);

            // Lista de todos os caminhos CEP onde a extensao deve ser instalada
            var cepTargets = new List<string>();

            // 1. Pasta CEP do Photoshop especifico
            if (!string.IsNullOrEmpty(inst.CepPath))
                cepTargets.Add(Path.Combine(inst.CepPath, BUNDLE_ID));

            // 2. AppData do usuario (%APPDATA%\Adobe\CEP\extensions)
            try
            {
                var appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
                cepTargets.Add(Path.Combine(appData, "Adobe", "CEP", "extensions", BUNDLE_ID));
            }
            catch { }

            // 3. Program Files (x86) Common Files
            try
            {
                var pfX86 = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86);
                cepTargets.Add(Path.Combine(pfX86, "Common Files", "Adobe", "CEP", "extensions", BUNDLE_ID));
            }
            catch { }

            // 4. Program Files 64-bit Common Files
            try
            {
                var pf64 = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
                cepTargets.Add(Path.Combine(pf64, "Common Files", "Adobe", "CEP", "extensions", BUNDLE_ID));
            }
            catch { }

            using (var archive = ZipFile.OpenRead(zipPath))
            {
                int total = archive.Entries.Count;
                int done  = 0;

                foreach (var entry in archive.Entries)
                {
                    done++;
                    int pct = progBase + (progEnd - progBase) / 4 + (done * (progEnd - progBase) * 3 / 4 / total);
                    bw.ReportProgress(pct);

                    string entryName = entry.FullName.Replace('\\', '/');
                    if (entryName.EndsWith("/")) continue; // pasta

                    // O DrawColor e somente CEP: qualquer entrada fora do prefixo
                    // 'cep/' e ignorada de proposito.
                    if (entryName.StartsWith("cep/"))
                    {
                        string sub = entryName.Substring("cep/".Length).Replace('/', Path.DirectorySeparatorChar);

                        foreach (var targetBase in cepTargets)
                        {
                            try
                            {
                                string destPath = Path.Combine(targetBase, sub);
                                var dir = Path.GetDirectoryName(destPath);
                                if (!Directory.Exists(dir)) Directory.CreateDirectory(dir);
                                entry.ExtractToFile(destPath, overwrite: true);
                            }
                            catch { }
                        }
                    }
                }
            }

            ReportLog(bw, "  Plugin instalado com sucesso em " + cepTargets.Count + " locais do sistema.", SUCCESS);
            ReportLog(bw, "  Reinicie o Photoshop para ativar a extensao.", WARNING);
        }

        int archive_count(string zip)
        {
            using (var a = ZipFile.OpenRead(zip))
                return a.Entries.Count;
        }

        // -- CEP DEBUG MODE ----------------------------------------------------
        void EnableCepDebugMode(BackgroundWorker bw)
        {
            // Photoshop 2018-2027 usam CSXS 6 ate 15
            // Escrever em HKCU, HKLM e WOW6432Node para funcionar em TODOS os usuarios do Windows
            string[] csxsVersions = { "6", "7", "8", "9", "9.4", "10", "11", "12", "13", "14", "15" };
            int enabled = 0;
            foreach (var ver in csxsVersions)
            {
                string relKey = @"Software\Adobe\CSXS." + ver;
                string relKeyWow = @"Software\WOW6432Node\Adobe\CSXS." + ver;

                // 1) HKCU (Usuario Atual)
                try
                {
                    using (var key = Registry.CurrentUser.CreateSubKey(relKey, true))
                    {
                        if (key != null) { key.SetValue("PlayerDebugMode", "1", RegistryValueKind.String); enabled++; }
                    }
                }
                catch { }

                // 2) HKLM (Local Machine - Todos os Usuarios)
                try
                {
                    using (var key = Registry.LocalMachine.CreateSubKey(relKey, true))
                    {
                        if (key != null) { key.SetValue("PlayerDebugMode", "1", RegistryValueKind.String); enabled++; }
                    }
                }
                catch { }

                // 3) HKLM WOW6432Node (Compatibilidade 32/64 bit)
                try
                {
                    using (var key = Registry.LocalMachine.CreateSubKey(relKeyWow, true))
                    {
                        if (key != null) { key.SetValue("PlayerDebugMode", "1", RegistryValueKind.String); enabled++; }
                    }
                }
                catch { }
            }
            ReportLog(bw, string.Format("  PlayerDebugMode ativado no Registro (HKCU + HKLM) em {0} chaves.", enabled), SUCCESS);
        }

        // -- INSTALAR CEP EM COMMON FILES E APPDATA ----------------------------
        void InstallCepToAppData(string cepSrcDir, BackgroundWorker bw, int progBase, int progEnd)
        {
            // 1) Instalar em %APPDATA%\Adobe\CEP\extensions\com.drawcolor.colorwheel
            var cepAppData = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                "Adobe", "CEP", "extensions", BUNDLE_ID
            );
            CopyDirectory(cepSrcDir, cepAppData, bw, progBase, progEnd);
            ReportLog(bw, "  CEP instalado em AppData: " + cepAppData, SUCCESS);

            // 2) Instalar em C:\Program Files (x86)\Common Files\Adobe\CEP\extensions\com.drawcolor.colorwheel
            try
            {
                var commonFiles = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86);
                var cepCommon = Path.Combine(commonFiles, "Common Files", "Adobe", "CEP", "extensions", BUNDLE_ID);
                CopyDirectory(cepSrcDir, cepCommon, bw, progBase, progEnd);
                ReportLog(bw, "  CEP instalado em Common Files: " + cepCommon, SUCCESS);
            }
            catch (Exception ex)
            {
                ReportLog(bw, "  AVISO Common Files: " + ex.Message, WARNING);
            }
        }

        void Log(string text, Color color)
        {
            if (rtbLog.InvokeRequired)
            {
                rtbLog.Invoke((MethodInvoker)(() => Log(text, color)));
                return;
            }
            rtbLog.SelectionStart  = rtbLog.TextLength;
            rtbLog.SelectionLength = 0;
            rtbLog.SelectionColor  = color;
            rtbLog.AppendText(text + "\n");
            rtbLog.ScrollToCaret();
        }

        void SetStatus(string text)
        {
            if (lblStatus.InvokeRequired) { lblStatus.Invoke((MethodInvoker)(() => SetStatus(text))); return; }
            lblStatus.Text = text;
        }

        // -- BACKUP ------------------------------------------------------------
        void DoBackup(PhotoshopInstallation inst, BackgroundWorker bw, int progBase, int progEnd)
        {
            var backupBase = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                "DrawColor_Installer", "backups",
                inst.Name.Replace(" ", "_"),
                DateTime.Now.ToString("yyyy-MM-dd_HH-mm-ss")
            );

            var cepSrc  = Path.Combine(inst.CepPath, BUNDLE_ID);
            var cepBack = Path.Combine(backupBase, "cep");

            if (!Directory.Exists(cepSrc))
            {
                ReportLog(bw, "  Plugin nao encontrado, backup nao necessario.", TEXT_DIM);
                return;
            }

            Directory.CreateDirectory(backupBase);

            ReportLog(bw, "  Backup CEP: " + cepBack, TEXT_DIM);
            CopyDirectory(cepSrc, cepBack, bw, progBase, progEnd);

            ReportLog(bw, "  Backup salvo em: " + backupBase, SUCCESS);
        }

        // -- RESTAURAR ---------------------------------------------------------
        void DoRestore(PhotoshopInstallation inst, BackgroundWorker bw, int progBase, int progEnd)
        {
            var backupRoot = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                "DrawColor_Installer", "backups",
                inst.Name.Replace(" ", "_")
            );

            if (!Directory.Exists(backupRoot))
            {
                ReportLog(bw, "  Nenhum backup encontrado para esta versao.", WARNING);
                return;
            }

            var backups = Directory.GetDirectories(backupRoot);
            if (backups.Length == 0)
            {
                ReportLog(bw, "  Nenhum backup disponivel.", WARNING);
                return;
            }

            Array.Sort(backups);
            var latestBackup = backups[backups.Length - 1];
            ReportLog(bw, "  Restaurando de: " + latestBackup, TEXT_DIM);

            var cepSrc = Path.Combine(latestBackup, "cep");
            var cepDst = Path.Combine(inst.CepPath, BUNDLE_ID);

            if (Directory.Exists(cepSrc))
                CopyDirectory(cepSrc, cepDst, bw, progBase, progEnd);

            ReportLog(bw, "  Restauracao concluida.", SUCCESS);
        }

        // -- UTILITARIOS -------------------------------------------------------
        void CopyDirectory(string src, string dst, BackgroundWorker bw, int progBase, int progEnd)
        {
            var files = Directory.GetFiles(src, "*", SearchOption.AllDirectories);
            for (int i = 0; i < files.Length; i++)
            {
                var file    = files[i];
                var relative = file.Substring(src.Length + 1);
                var destFile = Path.Combine(dst, relative);
                var destDir  = Path.GetDirectoryName(destFile);

                if (!Directory.Exists(destDir)) Directory.CreateDirectory(destDir);
                File.Copy(file, destFile, overwrite: true);

                int pct = progBase + (i + 1) * (progEnd - progBase) / files.Length;
                bw.ReportProgress(pct);
            }
        }

        void ReportLog(BackgroundWorker bw, string text, Color color)
        {
            bw.ReportProgress(-1, (object)new LogEntry { Text = text, Color = color });
        }

        // -- EVENTOS DOS BOTOES ------------------------------------------------
        void BtnInstall_Click(object sender, EventArgs e)
        {
            StartWorker(WorkerMode.Install, GetSelectedInstalls());
        }

        void BtnBackup_Click(object sender, EventArgs e)
        {
            StartWorker(WorkerMode.Backup, GetSelectedInstalls());
        }

        void BtnRestore_Click(object sender, EventArgs e)
        {
            StartWorker(WorkerMode.Restore, GetSelectedInstalls());
        }

        void BtnOpenFolder_Click(object sender, EventArgs e)
        {
            var path = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                "DrawColor_Installer", "backups"
            );
            if (!Directory.Exists(path)) Directory.CreateDirectory(path);
            Process.Start("explorer.exe", path);
        }

        void StartWorker(WorkerMode mode, List<PhotoshopInstallation> targets)
        {
            if (targets.Count == 0) { MessageBox.Show("Selecione ao menos uma versao do Photoshop.", "Aviso", MessageBoxButtons.OK, MessageBoxIcon.Warning); return; }
            _lastWorkerMode = mode;
            _lastInstalledCount = targets.Count;
            rtbLog.Clear();
            progressBar.Value = 0;
            SetStatus(mode == WorkerMode.Install ? "Instalando..." : (mode == WorkerMode.Backup ? "Fazendo backup..." : "Restaurando..."));
            UpdateButtonState();
            worker.RunWorkerAsync(new WorkerArgs { Mode = mode, Targets = targets });
        }

        void ShowSuccessScreen(int installedCount)
        {
            // Painel de overlay cobrindo toda a area de conteudo
            var pnlSuccess = new Panel
            {
                Location  = new Point(0, 73),
                Size      = new Size(780, 417),
                BackColor = BG_DARK
            };
            this.Controls.Add(pnlSuccess);
            pnlSuccess.BringToFront();

            // -- PAINEL ESQUERDO: Tutorial -------------------------------------
            var pnlSLeft = new Panel
            {
                Location  = new Point(0, 0),
                Size      = new Size(390, 417),
                BackColor = BG_DARK
            };
            pnlSuccess.Controls.Add(pnlSLeft);

            int y = 18;

            // Titulo de sucesso
            var lblOk = new Label
            {
                Text      = "Instalacao Concluida!",
                Font      = new Font("Segoe UI", 15f, FontStyle.Bold),
                ForeColor = SUCCESS,
                Location  = new Point(20, y),
                AutoSize  = true
            };
            pnlSLeft.Controls.Add(lblOk);
            y += 34;

            var lblSub = new Label
            {
                Text      = string.Format("Plugin instalado em {0} versao(oes) do Photoshop.", installedCount),
                Font      = new Font("Segoe UI", 9f),
                ForeColor = TEXT_DIM,
                Location  = new Point(20, y),
                Size      = new Size(355, 18)
            };
            pnlSLeft.Controls.Add(lblSub);
            y += 28;

            pnlSLeft.Controls.Add(new Panel { Location = new Point(18, y), Size = new Size(354, 1), BackColor = BORDER });
            y += 14;

            // Como abrir o plugin
            pnlSLeft.Controls.Add(new Label
            {
                Text      = "Como abrir o DrawColor:",
                Font      = new Font("Segoe UI", 10f, FontStyle.Bold),
                ForeColor = ACCENT,
                Location  = new Point(20, y),
                AutoSize  = true
            });
            y += 26;

            var openSteps = new[]
            {
                "1.  Abra o Adobe Photoshop",
                "2.  Va em:  Janela  >  Extensoes  >  DrawColor Wheel",
                "3.  Ferramentas:  Janela  >  Extensoes  >  DrawColor Tools"
            };
            foreach (var step in openSteps)
            {
                pnlSLeft.Controls.Add(new Label
                {
                    Text      = step,
                    Font      = new Font("Segoe UI", 9f),
                    ForeColor = TEXT_MAIN,
                    Location  = new Point(28, y),
                    Size      = new Size(348, 18)
                });
                y += 22;
            }
            y += 10;

            pnlSLeft.Controls.Add(new Panel { Location = new Point(18, y), Size = new Size(354, 1), BackColor = BORDER });
            y += 14;

            // Caixa de aviso: Plugin nao aparecendo?
            var pnlWarn = new Panel
            {
                Location  = new Point(16, y),
                Size      = new Size(358, 114),
                BackColor = Color.FromArgb(40, 14, 14)
            };
            pnlSLeft.Controls.Add(pnlWarn);

            // Barra lateral amarela de aviso
            pnlWarn.Controls.Add(new Panel { Location = new Point(0, 0), Size = new Size(4, 114), BackColor = WARNING });

            pnlWarn.Controls.Add(new Label
            {
                Text      = "Plugin nao aparecendo?",
                Font      = new Font("Segoe UI", 9.5f, FontStyle.Bold),
                ForeColor = WARNING,
                Location  = new Point(14, 8),
                AutoSize  = true
            });

            var warnSteps = new[]
            {
                "1.  Feche o Photoshop por completo e abra de novo",
                "2.  Confira:  Janela  >  Extensoes  >  DrawColor Wheel",
                "3.  Se o menu nao existir, rode este instalador",
                "     como administrador e instale outra vez"
            };
            int wy = 30;
            foreach (var ws in warnSteps)
            {
                pnlWarn.Controls.Add(new Label
                {
                    Text      = ws,
                    Font      = new Font("Segoe UI", 8.5f),
                    ForeColor = TEXT_MAIN,
                    Location  = new Point(14, wy),
                    Size      = new Size(338, 18)
                });
                wy += 20;
            }

            // -- SEPARADOR VERTICAL --------------------------------------------
            pnlSuccess.Controls.Add(new Panel { Location = new Point(389, 0), Size = new Size(1, 417), BackColor = BORDER });

            // -- PAINEL DIREITO: Acao ------------------------------------------
            var pnlSRight = new Panel
            {
                Location  = new Point(390, 0),
                Size      = new Size(390, 417),
                BackColor = BG_DARK
            };
            pnlSuccess.Controls.Add(pnlSRight);

            int ry = 14;

            pnlSRight.Controls.Add(new Label
            {
                Text      = "Versoes instaladas com sucesso:",
                Font      = new Font("Segoe UI", 10.5f, FontStyle.Bold),
                ForeColor = ACCENT,
                Location  = new Point(16, ry),
                AutoSize  = true
            });
            ry += 28;

            pnlSRight.Controls.Add(new Panel { Location = new Point(16, ry), Size = new Size(354, 1), BackColor = Color.FromArgb(80, 222, 34, 70) });
            ry += 12;

            foreach (var inst in foundInstalls)
            {
                pnlSRight.Controls.Add(new Label
                {
                    Text      = "+  " + inst.Name,
                    Font      = new Font("Segoe UI", 9.5f),
                    ForeColor = SUCCESS,
                    Location  = new Point(16, ry),
                    AutoSize  = true
                });
                ry += 24;
            }

            ry = Math.Max(ry + 20, 190);

            // Botao verde para fechar
            var btnClose = CreateFlatButton("Fechar Instalador", SUCCESS, Color.FromArgb(20, 160, 70), new Point(16, ry), new Size(354, 50));
            btnClose.Font  = new Font("Segoe UI", 13f, FontStyle.Bold);
            btnClose.Click += (s2, e2) => this.Close();
            pnlSRight.Controls.Add(btnClose);
            ry += 62;

            // Botoes de apoio
            var btnPixS = CreateFlatButton("Pix", CYAN_BTN, Color.FromArgb(0, 160, 160), new Point(16, ry), new Size(168, 32));
            btnPixS.Click += (s2, e2) => MessageBox.Show("Obrigado pelo apoio!\nChave Pix: pix@xuimart.com", "Apoiar via Pix", MessageBoxButtons.OK, MessageBoxIcon.Information);
            pnlSRight.Controls.Add(btnPixS);

            var btnKofiS = CreateFlatButton("Ko-fi", Color.FromArgb(41, 171, 226), Color.FromArgb(20, 130, 180), new Point(202, ry), new Size(168, 32));
            btnKofiS.Click += (s2, e2) => { try { System.Diagnostics.Process.Start("https://ko-fi.com"); } catch { } };
            pnlSRight.Controls.Add(btnKofiS);
        }

        struct LogEntry { public string Text; public Color Color; }
    }

    // =========================================================================
    // BOTAO COM HOVER
    // =========================================================================
    class FlatButton : Button
    {
        public Color HoverColor { get; set; }
        bool _hovered;
        Color _normalColor;

        protected override void OnMouseEnter(EventArgs e)
        {
            base.OnMouseEnter(e);
            _normalColor = this.BackColor;
            _hovered = true;
            this.BackColor = HoverColor;
        }
        protected override void OnMouseLeave(EventArgs e)
        {
            base.OnMouseLeave(e);
            _hovered = false;
            this.BackColor = _normalColor;
        }
    }

    // =========================================================================
    // DADOS DA INSTALACAO
    // =========================================================================
    class PhotoshopInstallation
    {
        public string Name      { get; set; }
        public string BasePath  { get; set; }
        public string CepPath   { get; set; }
        public bool   HasPlugin { get; set; }
    }
}
