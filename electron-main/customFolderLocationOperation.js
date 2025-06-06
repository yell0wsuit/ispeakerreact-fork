import { ipcMain } from "electron";
import applog from "electron-log";
import fs from "node:fs";
import * as fsPromises from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {
    getSaveFolder,
    settingsConf,
    getDataSubfolder,
    deleteEmptyDataSubfolder,
} from "./filePath.js";
import isDeniedSystemFolder from "./isDeniedSystemFolder.js";
import { generateLogFileName } from "./logOperations.js";

// Helper: Recursively collect all files in a directory
const getAllFiles = async (dir, base = dir) => {
    let files = [];
    const entries = await fsPromises.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            files = files.concat(await getAllFiles(fullPath, base));
        } else {
            files.push({
                abs: fullPath,
                rel: path.relative(base, fullPath),
            });
        }
    }
    return files;
};

// Helper: Determine if folder contents should be moved
const shouldMoveContents = (src, dest) => {
    return (
        src &&
        dest &&
        src !== dest &&
        fs.existsSync(src) &&
        fs.existsSync(dest) &&
        !src.startsWith(dest) &&
        !dest.startsWith(src)
    );
};

// Helper: Delete pronunciation-venv in oldSaveFolder before moving
const deletePronunciationVenv = async (oldSaveFolder, event) => {
    const oldVenvPath = path.join(oldSaveFolder, "pronunciation-venv");
    if (fs.existsSync(oldVenvPath)) {
        event.sender.send("venv-delete-status", { status: "deleting", path: oldVenvPath });
        try {
            await fsPromises.rm(oldVenvPath, { recursive: true, force: true });
            console.log("Deleted old pronunciation-venv at:", oldVenvPath);
            applog.info("Deleted old pronunciation-venv at:", oldVenvPath);
            event.sender.send("venv-delete-status", { status: "deleted", path: oldVenvPath });
        } catch (venvErr) {
            // Log but do not block move if venv doesn't exist or can't be deleted
            console.log("Could not delete old pronunciation-venv:", venvErr.message);
            applog.warn("Could not delete old pronunciation-venv:", venvErr.message);
            event.sender.send("venv-delete-status", {
                status: "error",
                path: oldVenvPath,
                error: venvErr.message,
            });
        }
    }
};

// Helper: Move all contents from one folder to another (copy then delete, robust for cross-device)
const moveFolderContents = async (src, dest, event) => {
    // Recursively collect all files for accurate progress
    const files = await getAllFiles(src);
    const total = files.length;
    let moved = 0;
    // 1. Copy all files
    for (const file of files) {
        const srcPath = file.abs;
        const destPath = path.join(dest, file.rel);
        await fsPromises.mkdir(path.dirname(destPath), { recursive: true });
        await fsPromises.copyFile(srcPath, destPath);
        moved++;
        if (event)
            event.sender.send("move-folder-progress", {
                moved,
                total,
                phase: "copy",
                name: file.rel,
            });
    }
    // 2. Delete all originals (files only)
    moved = 0;
    for (const file of files) {
        const srcPath = file.abs;
        await fsPromises.rm(srcPath, { force: true });
        moved++;
        if (event)
            event.sender.send("move-folder-progress", {
                moved,
                total,
                phase: "delete",
                name: file.rel,
            });
    }
    // 3. Remove empty directories in src (track progress for dirs)
    // We'll collect all directories and send progress for each
    const collectDirs = async (dir) => {
        let dirs = [dir];
        const entries = await fsPromises.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isDirectory()) {
                const fullPath = path.join(dir, entry.name);
                dirs = dirs.concat(await collectDirs(fullPath));
            }
        }
        return dirs;
    };
    const allDirs = await collectDirs(src);
    let dirDeleted = 0;
    for (const dirPath of allDirs.reverse()) {
        // delete from deepest
        try {
            await fsPromises.rmdir(dirPath);
            dirDeleted++;
            if (event) {
                event.sender.send("move-folder-progress", {
                    moved: dirDeleted,
                    total: allDirs.length,
                    phase: "delete-dir",
                    name: path.relative(src, dirPath) || ".",
                });
            }
        } catch {
            // Intentionally ignore errors if directory is not empty or already removed
        }
    }
    if (event)
        event.sender.send("move-folder-progress", {
            moved: total,
            total,
            phase: "delete-done",
            name: null,
        });
};

// IPC: Set custom save folder with validation and move contents
const setCustomSaveFolderIPC = () => {
    ipcMain.handle("set-custom-save-folder", async (event, folderPath) => {
        const oldSaveFolder = await getSaveFolder();
        let newSaveFolder;
        let prevCustomFolder = null;
        if (!folderPath) {
            // Reset to default
            const userSettings = settingsConf.store || {};
            if (userSettings.customSaveFolder) {
                prevCustomFolder = userSettings.customSaveFolder;
            }
            settingsConf.delete("customSaveFolder");
            // Use getSaveFolder to get the default save folder
            newSaveFolder = await getSaveFolder();
            applog.info("Reset to default save folder:", newSaveFolder);
            // Move contents back from previous custom folder's data subfolder if it exists
            let prevDataSubfolder = null;
            if (prevCustomFolder) {
                prevDataSubfolder = getDataSubfolder(prevCustomFolder);
            }
            // Ensure the destination exists before checking shouldMoveContents
            try {
                await fsPromises.mkdir(newSaveFolder, { recursive: true });
            } catch (e) {
                console.log("Failed to create default save folder:", e);
                applog.error("Failed to create default save folder:", e);
                return {
                    success: false,
                    error: "folderChangeError",
                    reason: e.message || "Unknown error",
                };
            }
            applog.info("[DEBUG] prevDataSubfolder:", prevDataSubfolder);
            applog.info("[DEBUG] newSaveFolder:", newSaveFolder);
            const shouldMove = shouldMoveContents(prevDataSubfolder, newSaveFolder);
            applog.info("[DEBUG] shouldMoveContents:", shouldMove);
            if (shouldMove) {
                applog.info(
                    "[DEBUG] Calling moveFolderContents with:",
                    prevDataSubfolder,
                    newSaveFolder
                );
                try {
                    await deletePronunciationVenv(prevDataSubfolder, event);
                    await moveFolderContents(prevDataSubfolder, newSaveFolder, event);
                } catch (moveBackErr) {
                    console.log("Failed to move contents back to default folder:", moveBackErr);
                    applog.error("Failed to move contents back to default folder:", moveBackErr);
                    return {
                        success: false,
                        error: "folderMoveError",
                        reason: moveBackErr.message || "Unknown move error",
                    };
                }
            }
        } else {
            try {
                await fsPromises.access(folderPath);
                const stat = await fsPromises.stat(folderPath);
                if (!stat.isDirectory()) {
                    console.log("Folder is not a directory:", folderPath);
                    applog.error("Folder is not a directory:", folderPath);
                    return {
                        success: false,
                        error: "folderChangeError",
                        reason: "toast.folderNotDir",
                    };
                }

                if (isDeniedSystemFolder(folderPath)) {
                    console.log("Folder is restricted:", folderPath);
                    applog.error("Folder is restricted:", folderPath);
                    return {
                        success: false,
                        error: "folderChangeError",
                        reason: "toast.folderRestricted",
                    };
                }

                const testFile = path.join(
                    folderPath,
                    `.__ispeakerreact_test_${process.pid}_${Date.now()}`
                );

                try {
                    await fsPromises.writeFile(testFile, "test");
                    await fsPromises.unlink(testFile);
                } catch {
                    console.log("Folder is not writable:", folderPath);
                    applog.error("Folder is not writable:", folderPath);
                    return {
                        success: false,
                        error: "folderChangeError",
                        reason: "toast.folderNoWrite",
                    };
                }
                // All good, save
                settingsConf.set("customSaveFolder", folderPath);
                // Use the data subfolder for all operations
                newSaveFolder = getDataSubfolder(folderPath);
                // Ensure the data subfolder exists
                try {
                    await fsPromises.mkdir(newSaveFolder, { recursive: true });
                } catch (e) {
                    console.log("Failed to create data subfolder:", e);
                    applog.error("Failed to create data subfolder:", e);
                    return {
                        success: false,
                        error: "folderChangeError",
                        reason: e.message || "Unknown error",
                    };
                }
                console.log("New save folder:", newSaveFolder);
                applog.info("New save folder:", newSaveFolder);
            } catch (err) {
                console.log("Error setting custom save folder:", err);
                applog.error("Error setting custom save folder:", err);
                return {
                    success: false,
                    error: "folderChangeError",
                    reason: err.message || "Unknown error",
                };
            }
        }
        // Move contents if needed
        try {
            if (shouldMoveContents(oldSaveFolder, newSaveFolder)) {
                await deletePronunciationVenv(oldSaveFolder, event);
                await moveFolderContents(oldSaveFolder, newSaveFolder, event);
            }
            // Update log directory and file name to new save folder
            const currentLogFolder = path.join(newSaveFolder, "logs");
            try {
                await fsPromises.mkdir(currentLogFolder, { recursive: true });
            } catch (e) {
                console.log("Failed to create new log directory:", e);
                applog.warn("Failed to create new log directory:", e);
            }
            applog.transports.file.fileName = generateLogFileName();
            applog.transports.file.resolvePathFn = () =>
                path.join(currentLogFolder, applog.transports.file.fileName);
            applog.info("New log directory:", currentLogFolder);
            console.log("New log directory:", currentLogFolder);
            // Only delete the empty ispeakerreact_data subfolder, never the parent custom folder
            if (prevCustomFolder) {
                await deleteEmptyDataSubfolder(prevCustomFolder);
            }
            return { success: true, newPath: newSaveFolder };
        } catch (moveErr) {
            console.log("Failed to move folder contents:", moveErr);
            applog.error("Failed to move folder contents:", moveErr);
            return {
                success: false,
                error: "folderMoveError",
                reason: moveErr.message || "Unknown move error",
            };
        }
    });
};

export { setCustomSaveFolderIPC };
