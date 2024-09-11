const vscode = require("vscode");
const fs = require("fs");
const path = require("path");

function activate(context) {
	let disposable = vscode.commands.registerCommand(
		"extension.findDependencies",
		async () => {
			const editor = vscode.window.activeTextEditor;
			if (editor) {
				const filePath = editor.document.uri.fsPath;
				vscode.window.showInformationMessage(
					"Searching dependencies from: " + filePath
				);

				const dependencies = findAllDependencies(filePath);

				const rootPath = vscode.workspace.rootPath;
				if (!rootPath) {
					vscode.window.showErrorMessage("No workspace root path found.");
					return;
				}

				const searchText = await vscode.window.showInputBox({
					placeHolder: "Enter text to search in files",
				});

				if (searchText === undefined || searchText === "") {
					vscode.window.showErrorMessage("No search text provided.");
					return;
				}

				const filteredDependencies = await filterDependenciesByContent(
					dependencies,
					searchText
				);

				const relativeDependencies = filteredDependencies.map((dep) => {
					return {
						label: path.relative(rootPath, dep),
						description: dep,
					};
				});

				showQuickPick(relativeDependencies);
			}
		}
	);

	context.subscriptions.push(disposable);
}

function deactivate() {}

function findAllDependencies(filePath, visited = new Set()) {
	if (visited.has(filePath)) {
		return []; // 避免循环依赖
	}
	visited.add(filePath);

	let fileContent;
	try {
		fileContent = fs.readFileSync(filePath, "utf-8");
	} catch (error) {
		if (error.code === "EISDIR") {
			console.error(`Error reading file ${filePath}: ${error.message}`);
		} else {
			console.error(`Error reading file ${filePath}: ${error.message}`);
		}
		return [];
	}

	const importRegex =
		/(?:import|require)\s*(?:[\w{}*]+\s+from\s+)?['"](.+?)['"]/g;

	let dependencies = [];
	let importPaths = [];

	let match;
	while ((match = importRegex.exec(fileContent)) !== null) {
		importPaths.push(match[1]);
	}

	const supportedExtensions = [".js", ".ts", ".jsx", ".tsx"];

	importPaths.forEach((importPath) => {
		let resolvedPath;
		if (importPath.startsWith("@/")) {
			resolvedPath = path.resolve(
				vscode.workspace.rootPath,
				"src",
				importPath.slice(2)
			);
		} else {
			resolvedPath = path.resolve(path.dirname(filePath), importPath);
		}

		let found = false;
		if (!path.extname(importPath)) {
			for (const ext of supportedExtensions) {
				const fullPath = resolvedPath + ext;
				if (fs.existsSync(fullPath) && !fs.statSync(fullPath).isDirectory()) {
					dependencies.push(fullPath);
					found = true;

					const subDependencies = findAllDependencies(fullPath, visited);
					dependencies = dependencies.concat(subDependencies);
					break;
				}
			}
		} else {
			const fullPath = resolvedPath;
			if (fs.existsSync(fullPath) && !fs.statSync(fullPath).isDirectory()) {
				dependencies.push(fullPath);

				const subDependencies = findAllDependencies(fullPath, visited);
				dependencies = dependencies.concat(subDependencies);
			}
		}

		if (!found) {
			console.warn(`Dependency file not found: ${importPath}`);
		}
	});

	return dependencies;
}

async function filterDependenciesByContent(dependencies, searchText) {
	const filteredDependencies = [];
	for (const dep of dependencies) {
		let fileContent;
		try {
			fileContent = fs.readFileSync(dep, "utf-8");
		} catch (error) {
			console.error(`Error reading file ${dep}: ${error.message}`);
			continue;
		}

		if (fileContent.includes(searchText)) {
			filteredDependencies.push(dep);
		}
	}
	return filteredDependencies;
}

async function openFile(filePath) {
	try {
		const document = await vscode.workspace.openTextDocument(filePath);
		await vscode.window.showTextDocument(document, { preview: false });
	} catch (error) {
		vscode.window.showErrorMessage(`Failed to open file: ${filePath}`);
	}
}

async function showQuickPick(items) {
	const quickPick = vscode.window.createQuickPick();
	quickPick.items = items;
	quickPick.placeholder = "File dependencies";

	quickPick.onDidChangeSelection((selection) => {
		if (selection.length > 0) {
			const selected = selection[0];
			openFile(selected.description);
			showQuickPick(items);
		}
	});

	quickPick.show();
}

module.exports = {
	activate,
	deactivate,
};
