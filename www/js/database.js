
/* ==========================================
   90-DAY COMMAND CENTER
   DATABASE MODULE
   Version 8 — Multi-Profile + Encryption
   ========================================== */

"use strict";


// ==========================================
// DATABASE CONFIGURATION
// ==========================================

const DB_NAME = "CommandCenterDB";
const DB_VERSION = 6;

const DEFAULT_PROFILE_ID = "current-user";

const PROFILE_REGISTRY_DB_NAME =
    "CommandCenterProfileRegistry";

const PROFILE_REGISTRY_DB_VERSION = 1;

const ACTIVE_PROFILE_STORAGE_KEY =
    "cc-active-profile-id";

const PROFILE_SETTINGS_KEY = "current-user";

const STORE_NAMES = [
    "profile",
    "tasks",
    "habits",
    "milestones",
    "projects"
];

const PBKDF2_ITERATIONS = 310000;

const ENCRYPTION_VERSION = 1;

const ENCRYPTED_RECORD_MARKER = "__hbtEncrypted";

let database = null;
let profileRegistryDatabase = null;

let activeDatabaseProfileId = null;

let databaseOpenToken = 0;
let profileRegistryOpeningPromise = null;
let openingDatabase = null;

// Unlocked encryption keys exist only in memory.
// They are never written to IndexedDB or localStorage.
const activeEncryptionKeys = new Map();


// ==========================================
// CRYPTOGRAPHY UTILITIES
// ==========================================

function getWebCrypto() {

    if (
        !window.crypto ||
        !window.crypto.subtle ||
        !window.crypto.getRandomValues
    ) {

        throw new Error(
            "Secure encryption is unavailable. Open the application using HTTPS or localhost."
        );

    }

    return window.crypto;

}


const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();


function bytesToBase64(bytes) {

    let binary = "";

    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }

    return btoa(binary);

}


function base64ToBytes(value) {

    const binary = atob(value);

    const bytes = new Uint8Array(binary.length);

    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }

    return bytes;

}


function randomBytes(length) {

    const bytes = new Uint8Array(length);

    getWebCrypto().getRandomValues(bytes);

    return bytes;

}


async function derivePasswordKey(password, salt, iterations) {

    if (typeof password !== "string" || password.length < 8) {

        throw new Error(
            "Password must contain at least 8 characters."
        );

    }

    const crypto = getWebCrypto();

    const passwordMaterial =
        await crypto.subtle.importKey(
            "raw",
            textEncoder.encode(password),
            "PBKDF2",
            false,
            ["deriveKey"]
        );


    return crypto.subtle.deriveKey(

        {
            name: "PBKDF2",
            salt,
            iterations,
            hash: "SHA-256"
        },

        passwordMaterial,

        {
            name: "AES-GCM",
            length: 256
        },

        false,

        ["encrypt", "decrypt"]

    );

}


// ==========================================
// ENCRYPTION KEY WRAPPING
// ==========================================

function getKeyWrappingAad(profileId) {

    return textEncoder.encode(
        `${profileId}|HBT-DATA-KEY|${ENCRYPTION_VERSION}`
    );

}


async function createEncryptionMetadata(
    profileId,
    password,
    rawDataKey,
    status = "migrating"
) {

    const salt = randomBytes(16);

    const iv = randomBytes(12);

    const iterations = PBKDF2_ITERATIONS;


    const wrappingKey = await derivePasswordKey(
        password,
        salt,
        iterations
    );


    const wrappedKey = await getWebCrypto().subtle.encrypt(

        {
            name: "AES-GCM",
            iv,
            additionalData: getKeyWrappingAad(profileId)
        },

        wrappingKey,

        rawDataKey

    );


    return {

        enabled: true,

        status,

        version: ENCRYPTION_VERSION,

        kdf: "PBKDF2-SHA-256",

        cipher: "AES-256-GCM",

        iterations,

        salt: bytesToBase64(salt),

        wrapIv: bytesToBase64(iv),

        wrappedKey: bytesToBase64(
            new Uint8Array(wrappedKey)
        )

    };

}


async function unwrapProfileDataKey(
    profileId,
    password,
    encryption
) {

    if (
        !encryption ||
        !encryption.enabled ||
        encryption.version !== ENCRYPTION_VERSION
    ) {

        throw new Error(
            "Profile encryption metadata is invalid or unsupported."
        );

    }


    const salt = base64ToBytes(encryption.salt);

    const iv = base64ToBytes(encryption.wrapIv);

    const wrappedKey = base64ToBytes(
        encryption.wrappedKey
    );


    const wrappingKey = await derivePasswordKey(
        password,
        salt,
        encryption.iterations || PBKDF2_ITERATIONS
    );


    let rawDataKey;

    try {

        rawDataKey = new Uint8Array(
            await getWebCrypto().subtle.decrypt(

                {
                    name: "AES-GCM",
                    iv,
                    additionalData: getKeyWrappingAad(profileId)
                },

                wrappingKey,

                wrappedKey

            )
        );

    } catch (_) {

        throw new Error(
            "Incorrect password or damaged encryption metadata."
        );

    }


    try {

        const key = await getWebCrypto().subtle.importKey(

            "raw",

            rawDataKey,

            {
                name: "AES-GCM"
            },

            false,

            ["encrypt", "decrypt"]

        );


        return {
            key,
            rawBytes: rawDataKey
        };

    } catch (error) {

        rawDataKey.fill(0);

        throw error;

    }

}


// ==========================================
// RECORD ENCRYPTION
// ==========================================

function getRecordAad(profileId, storeName, recordId) {

    return textEncoder.encode(

        `${profileId}|${storeName}|${String(recordId)}|HBT-RECORD-${ENCRYPTION_VERSION}`

    );

}


async function encryptRecord(
    storeName,
    record,
    profileId,
    dataKey
) {

    if (
        !record ||
        typeof record !== "object" ||
        record.id === undefined
    ) {

        throw new Error(
            `Cannot encrypt a ${storeName} record without an ID.`
        );

    }


    const iv = randomBytes(12);

    const plaintext = textEncoder.encode(
        JSON.stringify(record)
    );


    const encrypted = await getWebCrypto().subtle.encrypt(

        {
            name: "AES-GCM",
            iv,

            additionalData: getRecordAad(
                profileId,
                storeName,
                record.id
            )
        },

        dataKey,

        plaintext

    );


    return {

        id: record.id,

        [ENCRYPTED_RECORD_MARKER]: true,

        cryptoVersion: ENCRYPTION_VERSION,

        iv: bytesToBase64(iv),

        data: bytesToBase64(
            new Uint8Array(encrypted)
        )

    };

}


async function decryptRecord(
    storeName,
    encryptedRecord,
    profileId,
    dataKey
) {

    if (
        !encryptedRecord ||
        encryptedRecord[ENCRYPTED_RECORD_MARKER] !== true
    ) {

        return encryptedRecord;

    }


    if (
        encryptedRecord.cryptoVersion !== ENCRYPTION_VERSION
    ) {

        throw new Error(
            "This encrypted record uses an unsupported encryption version."
        );

    }


    try {

        const decrypted = await getWebCrypto().subtle.decrypt(

            {
                name: "AES-GCM",

                iv: base64ToBytes(
                    encryptedRecord.iv
                ),

                additionalData: getRecordAad(
                    profileId,
                    storeName,
                    encryptedRecord.id
                )

            },

            dataKey,

            base64ToBytes(
                encryptedRecord.data
            )

        );


        const record = JSON.parse(
            textDecoder.decode(decrypted)
        );


        if (
            String(record.id) !==
            String(encryptedRecord.id)
        ) {

            throw new Error(
                "Record integrity verification failed."
            );

        }


        return record;

    } catch (error) {

        console.error(
            `Could not decrypt ${storeName} record:`,
            error
        );


        throw new Error(
            `Unable to decrypt a ${storeName} record. Data integrity could not be verified.`
        );

    }

}


// ==========================================
// PROFILE ID UTILITIES
// ==========================================

function normalizeProfileId(profileId) {

    const id = String(
        profileId || DEFAULT_PROFILE_ID
    ).trim();


    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id)) {

        throw new Error(
            "Invalid profile ID. Use letters, numbers, hyphens or underscores."
        );

    }


    return id;

}


function getProfileDatabaseName(profileId) {

    const id = normalizeProfileId(profileId);


    if (id === DEFAULT_PROFILE_ID) {

        return DB_NAME;

    }


    return `${DB_NAME}_Profile_${id}`;

}


function getSavedActiveProfileId() {
    try {
        const savedId = localStorage.getItem(ACTIVE_PROFILE_STORAGE_KEY);
        return savedId ? normalizeProfileId(savedId) : null;
    } catch (error) {
        console.warn("Unable to read active profile:", error);
        return null;
    }
}


function getActiveProfileId() {
    return activeDatabaseProfileId ||
        getSavedActiveProfileId() ||
        DEFAULT_PROFILE_ID;
}


function setActiveProfileId(profileId) {

    const id = normalizeProfileId(profileId);


    try {

        localStorage.setItem(
            ACTIVE_PROFILE_STORAGE_KEY,
            id
        );

    } catch (error) {

        console.error(
            "Unable to save active profile:",
            error
        );

        throw new Error(
            "The active profile could not be saved."
        );

    }


    return id;

}


// ==========================================
// WORKSPACE DATABASE SCHEMA
// ==========================================

function createWorkspaceStores(db) {

    if (!db.objectStoreNames.contains("profile")) {

        db.createObjectStore("profile", {
            keyPath: "id"
        });

    }


    if (!db.objectStoreNames.contains("tasks")) {

        db.createObjectStore("tasks", {
            keyPath: "id",
            autoIncrement: true
        });

    }


    if (!db.objectStoreNames.contains("habits")) {

        db.createObjectStore("habits", {
            keyPath: "id",
            autoIncrement: true
        });

    }


    if (!db.objectStoreNames.contains("milestones")) {

        db.createObjectStore("milestones", {
            keyPath: "id",
            autoIncrement: true
        });

    }


    if (!db.objectStoreNames.contains("projects")) {

        db.createObjectStore("projects", {
            keyPath: "id",
            autoIncrement: true
        });

    }

}


// ==========================================
// PROFILE REGISTRY DATABASE
// ==========================================

function openProfileRegistryDatabase() {

    if (profileRegistryDatabase) {

        return Promise.resolve(
            profileRegistryDatabase
        );

    }


    if (profileRegistryOpeningPromise) {

        return profileRegistryOpeningPromise;

    }


    profileRegistryOpeningPromise = new Promise(
        (resolve, reject) => {

            const request = indexedDB.open(

                PROFILE_REGISTRY_DB_NAME,

                PROFILE_REGISTRY_DB_VERSION

            );


            request.onupgradeneeded = event => {

                const db = event.target.result;


                if (
                    !db.objectStoreNames.contains("profiles")
                ) {

                    const store = db.createObjectStore(
                        "profiles",
                        {
                            keyPath: "id"
                        }
                    );


                    store.createIndex(
                        "createdAt",
                        "createdAt",
                        {
                            unique: false
                        }
                    );

                }

            };


            request.onsuccess = event => {

                profileRegistryDatabase =
                    event.target.result;


                profileRegistryDatabase.onversionchange = () => {

                    profileRegistryDatabase.close();

                    profileRegistryDatabase = null;

                    profileRegistryOpeningPromise = null;

                };


                resolve(profileRegistryDatabase);

            };


            request.onerror = () => {

                reject(
                    request.error ||
                    new Error(
                        "Unable to open profile registry."
                    )
                );

            };


            request.onblocked = () => {

                console.warn(
                    "Profile registry opening is blocked by another tab."
                );

            };

        }
    );


    profileRegistryOpeningPromise.catch(() => {

        profileRegistryOpeningPromise = null;

    });


    return profileRegistryOpeningPromise;

}


// ==========================================
// PROFILE REGISTRY OPERATIONS
// ==========================================

async function getProfileAccount(profileId) {

    const id = normalizeProfileId(profileId);

    const db = await openProfileRegistryDatabase();


    return new Promise((resolve, reject) => {

        const transaction = db.transaction(
            "profiles",
            "readonly"
        );


        const request = transaction
            .objectStore("profiles")
            .get(id);


        request.onsuccess = () => {

            resolve(request.result || null);

        };


        request.onerror = () => {

            reject(
                request.error ||
                transaction.error
            );

        };

    });

}


async function saveProfileAccount(profileAccount) {

    if (
        !profileAccount ||
        typeof profileAccount !== "object"
    ) {

        throw new Error(
            "A valid profile account is required."
        );

    }


    const id = normalizeProfileId(
        profileAccount.id
    );


    const account = {

        ...profileAccount,

        id,

        createdAt:
            profileAccount.createdAt ||
            new Date().toISOString(),

        updatedAt: new Date().toISOString(),

        isDefault: id === DEFAULT_PROFILE_ID

    };


    const db = await openProfileRegistryDatabase();


    return new Promise((resolve, reject) => {

        const transaction = db.transaction(
            "profiles",
            "readwrite"
        );


        transaction.objectStore("profiles").put(
            account
        );


        transaction.oncomplete = () => resolve(true);


        transaction.onerror = () => {

            reject(
                transaction.error ||
                new Error("Unable to save profile account.")
            );

        };


        transaction.onabort = () => {

            reject(
                transaction.error ||
                new Error("Profile account save was aborted.")
            );

        };

    });

}


async function readProfileRegistryAccounts(db) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction("profiles", "readonly");
        const request = transaction.objectStore("profiles").getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error || transaction.error);
    });
}

async function removeStaleDefaultProfileAccount(db) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction("profiles", "readwrite");
        transaction.objectStore("profiles").delete(DEFAULT_PROFILE_ID);
        transaction.oncomplete = () => resolve(true);
        transaction.onerror = () => reject(transaction.error || new Error("Could not remove an empty legacy profile entry."));
        transaction.onabort = () => reject(transaction.error || new Error("Removing the legacy profile entry was aborted."));
    });
}

async function legacyDefaultDatabaseExists(defaultAccount) {
    try {
        if (typeof indexedDB.databases === "function") {
            const known = await indexedDB.databases();
            return known.some(item => item && item.name === DB_NAME);
        }
    } catch (error) {
        console.warn("Could not inspect existing workspace databases:", error);
    }

    // Older browsers may not expose indexedDB.databases(). Only use the
    // persisted pointer or an existing registry record as a conservative hint.
    try {
        return Boolean(defaultAccount) || localStorage.getItem(ACTIVE_PROFILE_STORAGE_KEY) === DEFAULT_PROFILE_ID;
    } catch (_) {
        return Boolean(defaultAccount);
    }
}

async function getAllProfileAccounts() {
    const registry = await openProfileRegistryDatabase();
    let accounts = await readProfileRegistryAccounts(registry);

    // Backward-compatible migration: keep the old current-user workspace only
    // when it actually contains data. Never manufacture a blank "Default Profile"
    // beside a newly created named workspace.
    if (!isDatabaseReady()) {
        const defaultAccount = accounts.find(account => account.id === DEFAULT_PROFILE_ID) || null;
        const legacyExists = await legacyDefaultDatabaseExists(defaultAccount);

        if (!legacyExists) {
            if (defaultAccount) {
                await removeStaleDefaultProfileAccount(registry);
                accounts = accounts.filter(account => account.id !== DEFAULT_PROFILE_ID);
            }
        } else if (!defaultAccount || !defaultAccount.encryption?.enabled) {
            let openedLegacyDatabase = false;
            try {
                await openDatabase(DEFAULT_PROFILE_ID);
                openedLegacyDatabase = true;

                const [profileRows, taskRows, habitRows, milestoneRows, projectRows] = await Promise.all([
                    getAllRecords("profile"),
                    getAllRecords("tasks"),
                    getAllRecords("habits"),
                    getAllRecords("milestones"),
                    getAllRecords("projects")
                ]);

                const workspaceProfile = profileRows.find(row => row && row.id === PROFILE_SETTINGS_KEY) || null;
                const hasWorkspaceData = [profileRows, taskRows, habitRows, milestoneRows, projectRows]
                    .some(rows => Array.isArray(rows) && rows.length > 0);

                if (!hasWorkspaceData) {
                    if (defaultAccount) {
                        await removeStaleDefaultProfileAccount(registry);
                        accounts = accounts.filter(account => account.id !== DEFAULT_PROFILE_ID);
                    }
                } else {
                    const legacyNameCandidate = String(workspaceProfile?.workspaceName || workspaceProfile?.name || "").trim();
                    const legacyName = ["Default Profile", "Previous Workspace", "Your Name"].includes(legacyNameCandidate) ? "" : legacyNameCandidate;
                    const accountName = legacyName || (defaultAccount?.name && defaultAccount.name !== "Default Profile"
                        ? defaultAccount.name
                        : "Previous Workspace");

                    if (!defaultAccount || defaultAccount.name !== accountName) {
                        await saveProfileAccount({
                            ...(defaultAccount || {}),
                            id: DEFAULT_PROFILE_ID,
                            name: accountName,
                            createdAt: defaultAccount?.createdAt || workspaceProfile?.createdAt || new Date().toISOString(),
                            isDefault: true
                        });
                    }
                }
            } catch (error) {
                // If a legacy database cannot be read (for example, older encrypted
                // data), preserve its registry entry rather than risking data loss.
                console.warn("Legacy workspace migration was deferred:", error);
                if (!defaultAccount) {
                    await saveProfileAccount({
                        id: DEFAULT_PROFILE_ID,
                        name: "Previous Workspace",
                        createdAt: new Date().toISOString(),
                        isDefault: true
                    });
                }
            } finally {
                if (openedLegacyDatabase) closeActiveDatabase();
            }

            accounts = await readProfileRegistryAccounts(registry);
        }
    }

    return accounts;
}


// ==========================================
// PROFILE ENCRYPTION STATUS
// ==========================================

async function getProfileEncryptionStatus(profileId) {

    const id = normalizeProfileId(profileId);

    const account = await getProfileAccount(id);

    const encryption = account?.encryption || null;


    return {

        profileId: id,

        enabled: Boolean(
            encryption?.enabled
        ),

        status: encryption?.status || "disabled",

        locked: Boolean(
            encryption?.enabled &&
            !activeEncryptionKeys.has(id)
        )

    };

}


async function isProfilePasswordProtected(profileId) {

    const status = await getProfileEncryptionStatus(
        profileId
    );

    return status.enabled;

}


function isProfileUnlocked(profileId) {

    const id = normalizeProfileId(profileId);

    return activeEncryptionKeys.has(id);

}


// ==========================================
// ACTIVE PROFILE ENCRYPTION CONTEXT
// ==========================================

async function getActiveEncryptionContext() {

    const profileId = getActiveProfileId();

    const account = await getProfileAccount(profileId);

    const encryption = account?.encryption || null;


    if (!encryption?.enabled) {

        return {

            profileId,

            enabled: false,

            key: null,

            metadata: null

        };

    }


    const unlocked = activeEncryptionKeys.get(
        profileId
    );


    if (!unlocked || !unlocked.key) {

        throw new Error(
            "This profile is locked. Unlock it before accessing its data."
        );

    }


    return {

        profileId,

        enabled: true,

        key: unlocked.key,

        metadata: encryption

    };

}


// ==========================================
// RAW WORKSPACE READ
// ==========================================

function readRawAllStores(db = ensureDatabaseReady()) {

    return new Promise((resolve, reject) => {

        const snapshot = {};

        let transaction;


        try {

            transaction = db.transaction(
                STORE_NAMES,
                "readonly"
            );


            STORE_NAMES.forEach(name => {

                const request = transaction
                    .objectStore(name)
                    .getAll();


                request.onsuccess = () => {

                    snapshot[name] =
                        request.result || [];

                };


                request.onerror = () => {

                    reject(
                        request.error ||
                        new Error(`Could not read ${name}.`)
                    );

                };

            });

        } catch (error) {

            reject(error);

            return;

        }


        transaction.oncomplete = () => {

            resolve(snapshot);

        };


        transaction.onerror = () => {

            reject(
                transaction.error ||
                new Error("Workspace read failed.")
            );

        };


        transaction.onabort = () => {

            reject(
                transaction.error ||
                new Error("Workspace read was aborted.")
            );

        };

    });

}


// ==========================================
// RAW WORKSPACE REPLACEMENT
// ==========================================
//
// All five stores are updated in one transaction.
// An aborted transaction does not leave a partial
// restore or encryption migration.
//

function writeRawAllStores(
    records,
    db = ensureDatabaseReady()
) {

    return new Promise((resolve, reject) => {

        let transaction;


        try {

            transaction = db.transaction(
                STORE_NAMES,
                "readwrite"
            );


            STORE_NAMES.forEach(name => {

                const store = transaction.objectStore(name);

                store.clear();


                (records[name] || []).forEach(record => {

                    store.put(record);

                });

            });

        } catch (error) {

            if (transaction) {

                try {
                    transaction.abort();
                } catch (_) {}

            }

            reject(error);

            return;

        }


        transaction.oncomplete = () => resolve(true);


        transaction.onerror = () => {

            reject(
                transaction.error ||
                new Error("Workspace update failed.")
            );

        };


        transaction.onabort = () => {

            reject(
                transaction.error ||
                new Error("Workspace update was rolled back.")
            );

        };

    });

}


// ==========================================
// ENCRYPTION MIGRATION
// ==========================================

async function migrateWorkspaceToEncryption(
    profileId,
    dataKey
) {

    const db = ensureDatabaseReady();

    const raw = await readRawAllStores(db);

    const encryptedStores = {};


    for (const storeName of STORE_NAMES) {

        encryptedStores[storeName] = [];


        for (const record of raw[storeName] || []) {

            // Ignore incomplete auto-increment reservations.
            if (record?.__hbtReservation === true) {
                continue;
            }


            if (
                record &&
                record[ENCRYPTED_RECORD_MARKER] === true
            ) {

                // Already encrypted: leave it unchanged.
                encryptedStores[storeName].push(record);

            } else {

                encryptedStores[storeName].push(

                    await encryptRecord(
                        storeName,
                        record,
                        profileId,
                        dataKey
                    )

                );

            }

        }

    }


    await writeRawAllStores(
        encryptedStores,
        db
    );

}


// ==========================================
// FINISH PASSWORD REMOVAL
// ==========================================

async function finishEncryptionRemoval(
    profileId,
    dataKey
) {

    const db = ensureDatabaseReady();

    const raw = await readRawAllStores(db);

    const plainStores = {};


    for (const storeName of STORE_NAMES) {

        plainStores[storeName] = [];


        for (const record of raw[storeName] || []) {

            if (record?.__hbtReservation === true) {
                continue;
            }


            if (
                record &&
                record[ENCRYPTED_RECORD_MARKER] === true
            ) {

                plainStores[storeName].push(

                    await decryptRecord(
                        storeName,
                        record,
                        profileId,
                        dataKey
                    )

                );

            } else {

                plainStores[storeName].push(record);

            }

        }

    }


    // First, atomically restore all records to plaintext.
    await writeRawAllStores(
        plainStores,
        db
    );


    // Only then remove the encryption metadata.
    const account = await getProfileAccount(profileId);


    if (account) {

        const updated = { ...account };

        delete updated.encryption;

        await saveProfileAccount(updated);

    }


    activeEncryptionKeys.delete(profileId);


    console.log(
        `Encryption removed from profile: ${profileId}`
    );

}


// ==========================================
// UNLOCK PROFILE
// ==========================================

async function unlockProfile(profileId, password) {

    const id = normalizeProfileId(profileId);


    // Ensure the selected workspace is open.
    await switchProfileDatabase(id);


    const account = await getProfileAccount(id);

    const encryption = account?.encryption || null;


    // Profiles without a password remain usable.
    if (!encryption?.enabled) {

        return true;

    }


    // Derive and unwrap the profile data key.
    const unlocked = await unwrapProfileDataKey(
        id,
        password,
        encryption
    );


    activeEncryptionKeys.set(
        id,
        unlocked
    );


    try {

        // Resume a migration if the browser was closed
        // during the original encryption operation.
        if (encryption.status === "migrating") {

            await migrateWorkspaceToEncryption(
                id,
                unlocked.key
            );


            await saveProfileAccount({

                ...account,

                encryption: {

                    ...encryption,

                    status: "active"

                }

            });

        }


        // Resume password removal if it was interrupted.
        if (encryption.status === "removing") {

            await finishEncryptionRemoval(
                id,
                unlocked.key
            );

        }


        return true;

    } catch (error) {

        console.error(
            "Profile encryption recovery failed:",
            error
        );

        // Keep the key available for a recovery attempt
        // during this page session.
        throw error;

    }

}


// ==========================================
// ENABLE PROFILE PASSWORD
// ==========================================

async function enableProfilePassword(
    profileId,
    password
) {

    const id = normalizeProfileId(profileId);


    if (id !== getActiveProfileId()) {

        throw new Error(
            "Open the profile before enabling its password."
        );

    }


    ensureDatabaseReady();


    const existing = await getProfileAccount(id);


    if (existing?.encryption?.enabled) {

        throw new Error(
            "This profile already has password encryption enabled."
        );

    }


    if (
        typeof password !== "string" ||
        password.length < 8
    ) {

        throw new Error(
            "Password must contain at least 8 characters."
        );

    }


    // Generate a new random data-encryption key.
    const rawDataKey = randomBytes(32);


    const importedKey = await getWebCrypto().subtle.importKey(

        "raw",

        rawDataKey,

        {
            name: "AES-GCM"
        },

        false,

        ["encrypt", "decrypt"]

    );


    // Wrap the data key using the password-derived key.
    const encryption = await createEncryptionMetadata(

        id,

        password,

        rawDataKey,

        "migrating"

    );


    // Preserve the raw data key only in memory.
    activeEncryptionKeys.set(id, {

        key: importedKey,

        rawBytes: rawDataKey

    });


    const account = {

        ...(existing || {}),

        id,

        name: existing?.name || "Unnamed Profile",

        encryption

    };


    // Save migration metadata before encrypting records.
    // Interrupted migrations can resume after unlocking.
    await saveProfileAccount(account);


    try {

        await migrateWorkspaceToEncryption(
            id,
            importedKey
        );


        await saveProfileAccount({

            ...account,

            encryption: {

                ...encryption,

                status: "active"

            }

        });


        console.log(
            `Profile encryption enabled: ${id}`
        );


        return true;

    } catch (error) {

        console.error(
            "Profile encryption migration failed:",
            error
        );


        throw new Error(
            "Password was saved, but data encryption did not finish. Keep this password and unlock the profile again to resume migration."
        );

    }

}


// ==========================================
// CHANGE PROFILE PASSWORD
// ==========================================
//
// The same random data key is re-wrapped.
// Workspace records do not need to be re-encrypted.
//

async function changeProfilePassword(
    profileId,
    currentPassword,
    newPassword
) {

    const id = normalizeProfileId(profileId);


    await unlockProfile(
        id,
        currentPassword
    );


    if (
        typeof newPassword !== "string" ||
        newPassword.length < 8
    ) {

        throw new Error(
            "New password must contain at least 8 characters."
        );

    }


    const unlocked = activeEncryptionKeys.get(id);


    if (!unlocked?.rawBytes) {

        throw new Error(
            "The profile data key is unavailable."
        );

    }


    const account = await getProfileAccount(id);

    if (!account?.encryption?.enabled) {

        throw new Error(
            "This profile does not currently have a password."
        );

    }


    const newEncryption = await createEncryptionMetadata(

        id,

        newPassword,

        unlocked.rawBytes,

        "active"

    );


    await saveProfileAccount({

        ...account,

        encryption: newEncryption

    });


    console.log(
        `Profile password changed: ${id}`
    );


    return true;

}


// ==========================================
// REMOVE PROFILE PASSWORD
// ==========================================

async function removeProfilePassword(
    profileId,
    currentPassword
) {

    const id = normalizeProfileId(profileId);


    await unlockProfile(
        id,
        currentPassword
    );


    const unlocked = activeEncryptionKeys.get(id);

    if (!unlocked?.key) {

        throw new Error(
            "The profile encryption key is unavailable."
        );

    }


    const account = await getProfileAccount(id);


    if (!account?.encryption?.enabled) {

        throw new Error(
            "This profile does not have password encryption enabled."
        );

    }


    const removalMetadata = {

        ...account.encryption,

        status: "removing"

    };


    // Save removal state before decrypting the records.
    await saveProfileAccount({

        ...account,

        encryption: removalMetadata

    });


    // Decrypt all stores and then remove encryption metadata.
    await finishEncryptionRemoval(
        id,
        unlocked.key
    );


    console.log(
        `Profile password removed: ${id}`
    );


    return true;

}


// ==========================================
// LOCK PROFILE
// ==========================================

function lockProfile(profileId) {

    const id = normalizeProfileId(profileId);


    const unlocked = activeEncryptionKeys.get(id);


    if (unlocked?.rawBytes) {

        unlocked.rawBytes.fill(0);

    }


    activeEncryptionKeys.delete(id);


    if (id === getActiveProfileId()) {

        closeActiveDatabase();

    }


    console.log(
        `Profile locked: ${id}`
    );


    return true;

}


// ==========================================
// OPEN WORKSPACE DATABASE
// ==========================================

function openDatabase(profileId = DEFAULT_PROFILE_ID) {

    let id;

    try {

        id = normalizeProfileId(profileId);

    } catch (error) {

        return Promise.reject(error);

    }


    if (
        database &&
        activeDatabaseProfileId === id
    ) {

        return Promise.resolve(database);

    }


    if (
        openingDatabase &&
        openingDatabase.profileId === id
    ) {

        return openingDatabase.promise;

    }


    // Clear the previously active workspace connection.
    if (database) {

        database.close();

        database = null;

        activeDatabaseProfileId = null;

    }


    const requestToken = ++databaseOpenToken;

    const dbName = getProfileDatabaseName(id);


    const promise = new Promise((resolve, reject) => {

        const request = indexedDB.open(
            dbName,
            DB_VERSION
        );


        request.onupgradeneeded = event => {

            const db = event.target.result;

            createWorkspaceStores(db);

            console.log(
                `Workspace database initialized: ${dbName}`
            );

        };


        request.onsuccess = event => {

            const openedDatabase = event.target.result;


            if (requestToken !== databaseOpenToken) {

                openedDatabase.close();

                reject(
                    new Error(
                        "Database opening was superseded by another profile switch."
                    )
                );

                return;

            }


            database = openedDatabase;

            activeDatabaseProfileId = id;


            database.onversionchange = () => {

                openedDatabase.close();


                if (database === openedDatabase) {

                    database = null;

                    activeDatabaseProfileId = null;

                }

            };


            console.log(
                `Database connected: ${dbName}`
            );


            resolve(database);

        };


        request.onerror = () => {

            reject(
                request.error ||
                new Error("Unable to open workspace database.")
            );

        };


        request.onblocked = () => {

            console.warn(
                "Database opening is blocked. Close other application tabs."
            );

        };

    });


    openingDatabase = {

        profileId: id,

        promise

    };


    promise.then(

        () => {

            if (
                openingDatabase &&
                openingDatabase.promise === promise
            ) {

                openingDatabase = null;

            }

        },

        () => {

            if (
                openingDatabase &&
                openingDatabase.promise === promise
            ) {

                openingDatabase = null;

            }

        }

    );


    return promise;

}


// ==========================================
// SWITCH ACTIVE WORKSPACE
// ==========================================

async function switchProfileDatabase(profileId) {

    const id = normalizeProfileId(profileId);


    const openedDatabase = await openDatabase(id);


    setActiveProfileId(id);


    console.log(
        `Active profile switched to: ${id}`
    );


    return openedDatabase;

}


// ==========================================
// CLOSE ACTIVE DATABASE
// ==========================================

function closeActiveDatabase() {

    databaseOpenToken++;


    if (database) {

        database.close();

    }


    database = null;

    activeDatabaseProfileId = null;

    openingDatabase = null;

}


// ==========================================
// DELETE PROFILE ACCOUNT
// ==========================================

async function deleteProfileAccount(profileId) {

    const id = normalizeProfileId(profileId);


    // Legacy current-user workspaces are ordinary user data and may be
    // deleted after they are signed out, just like any named workspace.
    if (id === activeDatabaseProfileId) {
        throw new Error("Close this workspace before deleting it.");
    }


    const db = await openProfileRegistryDatabase();


    return new Promise((resolve, reject) => {

        const transaction = db.transaction(
            "profiles",
            "readwrite"
        );


        transaction.objectStore("profiles").delete(id);


        transaction.oncomplete = () => resolve(true);


        transaction.onerror = () => {

            reject(
                transaction.error ||
                new Error("Unable to delete profile account.")
            );

        };


        transaction.onabort = () => {

            reject(
                transaction.error ||
                new Error("Profile deletion was aborted.")
            );

        };

    });

}


// ==========================================
// DELETE PROFILE DATABASE
// ==========================================

function deleteProfileDatabase(profileId) {

    let id;

    try {

        id = normalizeProfileId(profileId);

    } catch (error) {

        return Promise.reject(error);

    }


    // Use the database that is actually open, not the last-used localStorage
    // pointer (which intentionally survives sign-out so the selector can mark
    // that workspace as last opened).
    if (id === activeDatabaseProfileId) {
        return Promise.reject(new Error("Close this workspace before deleting its database."));
    }


    const dbName = getProfileDatabaseName(id);


    return new Promise((resolve, reject) => {

        const request = indexedDB.deleteDatabase(dbName);


        request.onsuccess = () => resolve(true);


        request.onerror = () => {

            reject(
                request.error ||
                new Error("Unable to delete profile database.")
            );

        };


        request.onblocked = () => {

            reject(
                new Error(
                    "Profile database deletion is blocked. Close other application tabs."
                )
            );

        };

    });

}


// ==========================================
// DATABASE READINESS
// ==========================================

function ensureDatabaseReady() {

    if (!database) {

        throw new Error(
            "Database is not ready. Open the active profile database first."
        );

    }


    return database;

}


// ==========================================
// READ RECORDS
// ==========================================

async function getAllRecords(storeName) {

    const db = ensureDatabaseReady();


    if (!STORE_NAMES.includes(storeName)) {

        throw new Error(
            `Unknown database store: ${storeName}`
        );

    }


    const rawRows = await new Promise((resolve, reject) => {

        const transaction = db.transaction(
            storeName,
            "readonly"
        );


        const request = transaction
            .objectStore(storeName)
            .getAll();


        request.onsuccess = () => {

            resolve(request.result || []);

        };


        request.onerror = () => {

            reject(
                request.error ||
                transaction.error
            );

        };


        transaction.onabort = () => {

            reject(
                transaction.error ||
                new Error(`Reading ${storeName} was aborted.`)
            );

        };

    });


    const context = await getActiveEncryptionContext();


    // Normal unencrypted profile.
    if (!context.enabled) {

        return rawRows.filter(
            row => row?.__hbtReservation !== true
        );

    }


    const decryptedRows = [];


    for (const row of rawRows) {

        if (row?.__hbtReservation === true) {
            continue;
        }


        const isEncrypted =
            row?.[ENCRYPTED_RECORD_MARKER] === true;


        if (
            !isEncrypted &&
            context.metadata.status === "active"
        ) {

            throw new Error(
                `Unexpected unencrypted record found in protected store "${storeName}".`
            );

        }


        decryptedRows.push(

            isEncrypted

                ? await decryptRecord(
                    storeName,
                    row,
                    context.profileId,
                    context.key
                )

                : row

        );

    }


    return decryptedRows;

}


// ==========================================
// RESERVE AUTO-INCREMENT ID
// ==========================================

function reserveAutoIncrementId(storeName) {

    const db = ensureDatabaseReady();


    return new Promise((resolve, reject) => {

        const transaction = db.transaction(
            storeName,
            "readwrite"
        );


        const request = transaction
            .objectStore(storeName)
            .add({
                __hbtReservation: true
            });


        let reservedId = null;


        request.onsuccess = () => {

            reservedId = Number(request.result);

        };


        request.onerror = () => {

            reject(
                request.error ||
                transaction.error
            );

        };


        transaction.oncomplete = () => {

            if (reservedId === null) {

                reject(
                    new Error(
                        `Could not reserve an ID in ${storeName}.`
                    )
                );

                return;

            }


            resolve(reservedId);

        };


        transaction.onabort = () => {

            reject(
                transaction.error ||
                new Error("ID reservation was aborted.")
            );

        };

    });

}


// ==========================================
// SAVE RECORDS
// ==========================================

async function saveRecord(storeName, record) {

    const db = ensureDatabaseReady();


    if (
        !STORE_NAMES.includes(storeName) ||
        !record ||
        typeof record !== "object" ||
        Array.isArray(record)
    ) {

        throw new Error(
            "Invalid database record."
        );

    }


    const context = await getActiveEncryptionContext();


    // --------------------------------------
    // NORMAL PLAINTEXT STORAGE
    // --------------------------------------

    if (!context.enabled) {

        return new Promise((resolve, reject) => {

            const transaction = db.transaction(
                storeName,
                "readwrite"
            );


            transaction.objectStore(storeName).put(
                record
            );


            transaction.oncomplete = () => resolve(true);


            transaction.onerror = () => {

                reject(
                    transaction.error ||
                    new Error(`Unable to save ${storeName}.`)
                );

            };


            transaction.onabort = () => {

                reject(
                    transaction.error ||
                    new Error(`${storeName} save was aborted.`)
                );

            };

        });

    }


    // --------------------------------------
    // PROTECTED PROFILE STORAGE
    // --------------------------------------

    let recordToSave = { ...record };

    let reservedId = null;


    if (recordToSave.id === undefined) {

        if (storeName === "profile") {

            throw new Error(
                "Profile records require an ID."
            );

        }


        reservedId = await reserveAutoIncrementId(
            storeName
        );


        recordToSave.id = reservedId;

    }


    try {

        const encryptedRecord = await encryptRecord(

            storeName,

            recordToSave,

            context.profileId,

            context.key

        );


        await new Promise((resolve, reject) => {

            const transaction = db.transaction(
                storeName,
                "readwrite"
            );


            transaction.objectStore(storeName).put(
                encryptedRecord
            );


            transaction.oncomplete = () => resolve(true);


            transaction.onerror = () => {

                reject(
                    transaction.error ||
                    new Error(`Unable to save encrypted ${storeName}.`)
                );

            };


            transaction.onabort = () => {

                reject(
                    transaction.error ||
                    new Error(`Encrypted ${storeName} save was aborted.`)
                );

            };

        });


        return true;

    } catch (error) {

        // Remove a temporary reservation if encryption fails.
        if (reservedId !== null) {

            try {

                await deleteRecord(
                    storeName,
                    reservedId
                );

            } catch (_) {}

        }


        throw error;

    }

}


// ==========================================
// DELETE RECORDS
// ==========================================

async function deleteRecord(storeName, id) {

    const db = ensureDatabaseReady();


    if (!STORE_NAMES.includes(storeName)) {

        throw new Error(
            `Unknown database store: ${storeName}`
        );

    }


    // A protected workspace must be unlocked before
    // any record mutation is permitted.
    await getActiveEncryptionContext();


    return new Promise((resolve, reject) => {

        const transaction = db.transaction(
            storeName,
            "readwrite"
        );


        transaction.objectStore(storeName).delete(
            Number(id)
        );


        transaction.oncomplete = () => resolve(true);


        transaction.onerror = () => {

            reject(
                transaction.error ||
                new Error(`Unable to delete ${storeName}.`)
            );

        };


        transaction.onabort = () => {

            reject(
                transaction.error ||
                new Error(`${storeName} deletion was aborted.`)
            );

        };

    });

}


// ==========================================
// EXPORT DECRYPTED WORKSPACE DATA
// ==========================================

async function exportWorkspaceData() {

    const stores = {};


    for (const storeName of STORE_NAMES) {

        stores[storeName] = await getAllRecords(
            storeName
        );

    }


    return stores;

}


// ==========================================
// RESTORE WORKSPACE DATA
// ==========================================

async function restoreWorkspaceData(stores) {

    if (
        !stores ||
        typeof stores !== "object"
    ) {

        throw new Error(
            "Invalid workspace data."
        );

    }


    const db = ensureDatabaseReady();

    const context = await getActiveEncryptionContext();

    const recordsToWrite = {};


    for (const storeName of STORE_NAMES) {

        if (!Array.isArray(stores[storeName])) {

            throw new Error(
                `The ${storeName} data list is missing.`
            );

        }


        recordsToWrite[storeName] = [];


        for (const record of stores[storeName]) {

            if (
                !record ||
                typeof record !== "object" ||
                record.id === undefined
            ) {

                throw new Error(
                    `Invalid record in ${storeName}.`
                );

            }


            recordsToWrite[storeName].push(

                context.enabled

                    ? await encryptRecord(
                        storeName,
                        record,
                        context.profileId,
                        context.key
                    )

                    : record

            );

        }

    }


    return writeRawAllStores(
        recordsToWrite,
        db
    );

}


// ==========================================
// PROFILE SETTINGS OPERATIONS
// ==========================================

function saveProfile(profile) {

    if (
        !profile ||
        typeof profile !== "object" ||
        Array.isArray(profile)
    ) {

        return Promise.reject(
            new Error("A valid profile object is required.")
        );

    }


    const profileRecord = {

        ...profile,

        id: PROFILE_SETTINGS_KEY

    };


    return saveRecord(
        "profile",
        profileRecord
    );

}


async function getProfile() {

    const rows = await getAllRecords("profile");


    return rows.find(
        row => row.id === PROFILE_SETTINGS_KEY
    ) || null;

}


// ==========================================
// TASK OPERATIONS
// ==========================================

function getAllTasks() {

    return getAllRecords("tasks");

}


function saveTask(task) {

    return saveRecord(
        "tasks",
        task
    );

}


function deleteTask(id) {

    return deleteRecord(
        "tasks",
        id
    );

}


// ==========================================
// HABIT OPERATIONS
// ==========================================

function getAllHabits() {

    return getAllRecords("habits");

}


function saveHabit(habit) {

    return saveRecord(
        "habits",
        habit
    );

}


function deleteHabit(id) {

    return deleteRecord(
        "habits",
        id
    );

}


// ==========================================
// MILESTONE OPERATIONS
// ==========================================

function getAllMilestones() {

    return getAllRecords("milestones");

}


function saveMilestone(milestone) {

    return saveRecord(
        "milestones",
        milestone
    );

}


function deleteMilestone(id) {

    return deleteRecord(
        "milestones",
        id
    );

}


// ==========================================
// PROJECT OPERATIONS
// ==========================================

function getAllProjects() {

    return getAllRecords("projects");

}


function saveProject(project) {

    return saveRecord(
        "projects",
        project
    );

}


function deleteProject(id) {

    return deleteRecord(
        "projects",
        id
    );

}


// ==========================================
// DATABASE STATUS
// ==========================================

function isDatabaseReady() {

    return (
        typeof IDBDatabase !== "undefined" &&
        database instanceof IDBDatabase
    );

}


// ==========================================
// INITIALIZATION SUPPORT
// ==========================================

async function initializeDefaultProfileAccount() {
    // Do not manufacture a visible "Default Profile" entry. This helper is
    // retained for compatibility with older builds, but only returns an
    // existing legacy workspace account or creates one from real saved data.
    const existing = await getProfileAccount(DEFAULT_PROFILE_ID);
    if (existing) return existing;

    const existingWorkspaceProfile = await getProfile();
    const legacyNameCandidate = String(
        existingWorkspaceProfile?.workspaceName || existingWorkspaceProfile?.name || ""
    ).trim();
    const legacyName = ["Default Profile", "Previous Workspace", "Your Name"].includes(legacyNameCandidate)
        ? ""
        : legacyNameCandidate;
    if (!legacyName) return null;

    const account = {
        id: DEFAULT_PROFILE_ID,
        name: legacyName,
        createdAt: existingWorkspaceProfile?.createdAt || new Date().toISOString(),
        isDefault: true
    };

    await saveProfileAccount(account);
    return account;
}


// ==========================================
// DATABASE SECURITY API
// ==========================================

window.getProfileEncryptionStatus =
    getProfileEncryptionStatus;

window.isProfilePasswordProtected =
    isProfilePasswordProtected;

window.isProfileUnlocked =
    isProfileUnlocked;

window.enableProfilePassword =
    enableProfilePassword;

window.unlockProfile =
    unlockProfile;

window.lockProfile =
    lockProfile;

window.changeProfilePassword =
    changeProfilePassword;

window.removeProfilePassword =
    removeProfilePassword;

window.switchProfileDatabase =
    switchProfileDatabase;

window.getActiveProfileId =
    getActiveProfileId;

window.getSavedActiveProfileId =
    getSavedActiveProfileId;

window.getAllProfileAccounts =
    getAllProfileAccounts;

window.getProfileAccount =
    getProfileAccount;

window.saveProfileAccount =
    saveProfileAccount;

window.deleteProfileAccount =
    deleteProfileAccount;

window.deleteProfileDatabase =
    deleteProfileDatabase;

window.exportWorkspaceData =
    exportWorkspaceData;

window.restoreWorkspaceData =
    restoreWorkspaceData;

window.initializeDefaultProfileAccount =
    initializeDefaultProfileAccount;


console.log(
    "Database module loaded — Multi-Profile and AES-GCM support."
);
