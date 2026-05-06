import PDFEdit from "./providers/editorProvider.js";
import PdfViewerApi from "./api/index.js";

const vscode = require("vscode");

function requireNodeModule(moduleName) {
  return eval("require")(moduleName);
}

function parseSyncTeXOutput(output) {
  const record = {};
  let started = false;

  for (const line of output.split("\n")) {
    if (line.includes("SyncTeX result begin")) {
      started = true;
      continue;
    }

    if (line.includes("SyncTeX result end")) {
      break;
    }

    if (!started) {
      continue;
    }

    const separatorIndex = line.indexOf(":");
    if (separatorIndex < 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).toLowerCase();
    if (key !== "page" && key !== "x" && key !== "y") {
      continue;
    }

    record[key] = Number(line.slice(separatorIndex + 1));
  }

  if (
    Number.isFinite(record.page) &&
    Number.isFinite(record.x) &&
    Number.isFinite(record.y)
  ) {
    return record;
  }

  throw new Error("Unable to parse SyncTeX output.");
}

function getRootTexUri(document) {
  const path = requireNodeModule("path");
  const rootPattern = /^\s*%\s*!TEX\s+root\s*=\s*(.+)\s*$/i;
  const maxLines = Math.min(document.lineCount, 30);

  for (let line = 0; line < maxLines; line += 1) {
    const match = document.lineAt(line).text.match(rootPattern);
    if (!match) {
      continue;
    }

    const rootPath = match[1].trim();
    const resolvedPath = path.isAbsolute(rootPath)
      ? rootPath
      : path.resolve(path.dirname(document.uri.fsPath), rootPath);

    return vscode.Uri.file(resolvedPath);
  }

  return document.uri;
}

function getPdfUriForTexDocument(document) {
  const rootUri = getRootTexUri(document);
  const pdfPath = rootUri.fsPath.replace(/\.(tex|ltx)$/i, ".pdf");

  return vscode.Uri.file(pdfPath);
}

async function runSyncTeX({ line, column, texPath, pdfPath }) {
  const childProcess = requireNodeModule("child_process");
  const path = requireNodeModule("path");
  const command =
    vscode.workspace.getConfiguration("latex-workshop").get("synctex.path", "synctex") || "synctex";
  const args = ["view", "-i", `${line}:${column + 1}:${texPath}`, "-o", pdfPath];

  return new Promise((resolve, reject) => {
    const proc = childProcess.spawn(command, args, { cwd: path.dirname(pdfPath) });
    let stdout = "";
    let stderr = "";

    proc.stdout?.setEncoding("utf8");
    proc.stderr?.setEncoding("utf8");
    proc.stdout?.on("data", (chunk) => {
      stdout += chunk;
    });
    proc.stderr?.on("data", (chunk) => {
      stderr += chunk;
    });
    proc.on("error", reject);
    proc.on("exit", (exitCode) => {
      if (exitCode !== 0) {
        reject(new Error(stderr || `SyncTeX exited with code ${exitCode}.`));
        return;
      }

      try {
        resolve(parseSyncTeXOutput(stdout));
      } catch (error) {
        reject(error);
      }
    });
  });
}

async function syncTexToCursorPdf(context) {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage("No active TeX editor found for SyncTeX.");
    return;
  }

  const document = editor.document;
  if (!["tex", "latex"].includes(document.languageId)) {
    vscode.window.showWarningMessage("SyncTeX requires an active TeX or LaTeX editor.");
    return;
  }

  const pdfUri = getPdfUriForTexDocument(document);

  try {
    await vscode.workspace.fs.stat(pdfUri);
  } catch (_error) {
    vscode.window.showWarningMessage(`PDF not found for SyncTeX: ${pdfUri.fsPath}`);
    return;
  }

  try {
    const record = await runSyncTeX({
      line: editor.selection.active.line + 1,
      column: editor.selection.active.character,
      texPath: document.uri.fsPath,
      pdfPath: pdfUri.fsPath,
    });
    await PDFEdit.locatePdf(context, pdfUri, record);
  } catch (error) {
    vscode.window.showWarningMessage(`SyncTeX failed: ${error.message || String(error)}`);
  }
}

exports.activate = function (context) {
  // Register the custom editor provider and add to subscriptions
  const providerDisposable = PDFEdit.register(context);
  context.subscriptions.push(providerDisposable);

  // Register command to force save
  const commandDisposable = vscode.commands.registerCommand("texmarkPdfReader.forceSave", () => {
    PDFEdit.forceSave(context);
  });
  context.subscriptions.push(commandDisposable);

  const syncTexDisposable = vscode.commands.registerCommand("texmarkPdfReader.synctex", () => {
    syncTexToCursorPdf(context);
  });
  context.subscriptions.push(syncTexDisposable);

  return {
    getV1Api: function () {
      return PdfViewerApi;
    },
  };
};

// Cleanup function called when extension is deactivated
exports.deactivate = function () {
  // VS Code will automatically dispose all items in context.subscriptions
  // Additional cleanup can be added here if needed
};
