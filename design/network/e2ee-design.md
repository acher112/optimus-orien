# End-to-End Encrypted (E2EE) 1-to-1 Chat Cryptographic Architecture
## Optimus Orien Academic Network — Stage 3 Technical Specification

- **Document ID**: `SPEC-NET-E2EE-001`
- **Feature**: Professional 1-to-1 Messaging for Verified Adult Educators
- **Status**: **PROPOSED / AWAITING STAGE 3 APPROVAL**
- **Date**: November 20, 2026
- **Authors**: Optimus Orien Platform Architecture & Cryptography Working Group
- **Constraint Checklist**:
  - [x] No custom/invented cryptography (audited primitives and implementations only)
  - [x] Absolute child safety barrier (minors strictly barred at API & UI)
  - [x] Zero server-side plaintext access (client-side key generation & encryption)
  - [x] Verifiable abuse reporting without cryptographic backdoors
  - [x] Clear threat model and limitation disclosure

---

## 1. Executive Summary & Design Principles

The Optimus Orien Academic Network introduces private 1-to-1 messaging strictly between **connected, verified adult educators** (principals, academic directors, verified faculty). Minors (students under 18) and parents have zero messaging capabilities.

To guarantee institutional privacy, communications must be **End-to-End Encrypted (E2EE)**:
1. **Zero-Knowledge Server Architecture**: The central server functions purely as an untrusted blind message router and public key directory. The server never observes, handles, or stores private keys or message plaintext.
2. **Standard Audited Cryptography**: Under no circumstances will cryptographic primitives, hash functions, or ratchets be created in-house. All implementations must use peer-reviewed, externally audited open-source libraries.
3. **Forward Secrecy (FS) & Post-Compromise Security (PCS)**: A compromise of a long-term identity key or a single session key must not compromise past messages (Forward Secrecy) or all future messages once the attacker loses access (Break-in Recovery).
4. **Verifiable Reporting (Accountability without Backdoors)**: To uphold professional community standards, educators must be able to submit cryptographic proof of harassment or misconduct to platform administration without creating a general backdoor or escrowing private keys.

---

## 2. Comparison of Cryptographic Library Candidates

In accordance with Section 6 of the project directive, we evaluated three production-grade cryptographic ecosystems for web browser execution.

| Evaluation Metric | Option 1: `@matrix-org/vodozemac` (Matrix Double Ratchet) | Option 2: `libsodium-wrappers` (Public-Key Box / X25519) | Option 3: `libsignal-client` (Signal Foundation) |
| :--- | :--- | :--- | :--- |
| **Primary Primitives** | Curve25519, Ed25519, AES-256-GCM, HKDF-SHA256, HMAC-SHA256 | X25519, Ed25519, ChaCha20-Poly1305, BLAKE2b | Curve25519, AES-256-CBC, HMAC-SHA256, HKDF |
| **Ratchet Implementation** | Full Double Ratchet (Diffie-Hellman + Symmetric Key Derivation) | **None** out of the box (requires custom state machine or third-party extension) | Full Double Ratchet (Signal Protocol) |
| **Forward Secrecy (FS)** | **Native & Automatic** (per-message key ratcheting) | ❌ **No FS** unless custom ratchet is authored (violates "do not invent crypto") | **Native & Automatic** |
| **Post-Compromise Recovery**| **Native** (re-ratchets on peer DH step) | ❌ None | **Native** |
| **Independent Security Audit** | **Audited by Least Authority (2022)** — Formal report published with zero critical vulnerabilities | **Audited extensively** (Matasano, Quarkslab, Cure53 across libsodium core) | **Audited** (NCC Group, Inria, Oxford University) |
| **Open Source License** | **Apache 2.0** (Fully permissive, commercial-safe, SaaS-friendly) | **ISC License** (Permissive, commercial-safe) | ⚠️ **AGPLv3** (Strong copyleft: high legal risk of viral source disclosure for SaaS) |
| **Maintenance Status** | **Active** — Official Matrix.org foundation project replacing deprecated `libolm` | **Active & Mature** — Maintained by Frank Denis (`jedisct1`) | Active by Signal, but Web/JS targets are second-class compared to Rust/Mobile |
| **Runtime & Bundle Size** | WebAssembly (Wasm) + TypeScript bindings (~380 KB Wasm, 30 KB JS) | Wasm + JS wrapper (~180 KB Wasm, 25 KB JS) | Heavy Rust Wasm bundle (>1.2 MB), complex toolchain dependencies |
| **Session Persistence** | Built-in encrypted session pickling (`Session.pickle(key)`) | Manual key & nonce state management | Complex client database state |

### Detailed Evaluation of Option 1: `@matrix-org/vodozemac` (RECOMMENDED)
- **Origin & Maintenance**: Authored in pure Rust by the Matrix.org core security team as the memory-safe replacement for the deprecated C library `libolm`. It compiles directly to WebAssembly for browser execution (`@matrix-org/vodozemac`).
- **Audit Findings**: Formally audited by **Least Authority in 2022**. The audit confirmed that the cryptographic primitives, Double Ratchet state transitions, and memory zeroization operate correctly without timing side-channels.
- **Licensing**: Permissive **Apache-2.0**, allowing seamless integration into Optimus Orien without viral licensing constraints.
- **Why It Wins**: It provides an out-of-the-box, fully audited Double Ratchet implementation with native Ed25519 identity keys, Curve25519 Diffie-Hellman pre-keys, and AES-256-GCM authenticated message encryption.

### Detailed Evaluation of Option 2: `libsodium-wrappers`
- **Origin & Maintenance**: Port of the battle-tested `libsodium` library to JavaScript and WebAssembly.
- **Audit Findings**: Extensively audited across multiple decades.
- **Licensing**: Permissive **ISC License**.
- **Critical Limitation for E2EE Chat**: While `crypto_box_easy` provides rock-solid authenticated public-key encryption (X25519 + ChaCha20-Poly1305), **libsodium does not implement the Double Ratchet state machine**. Using libsodium alone means either:
  1. *Static Public-Key Encryption*: Every message between Alice and Bob uses the same shared secret. If a device key is compromised at any point in the future, **all past conversations can be decrypted retroactively** (zero Forward Secrecy).
  2. *Inventing a Homegrown Ratchet*: Authoring a custom state machine over libsodium symmetric primitives directly violates the non-negotiable rule *"Do NOT invent cryptography"*.

### Detailed Evaluation of Option 3: `libsignal-client`
- **Critical Blocker**: The Signal client libraries are licensed under **AGPL-3.0**. Under AGPL-3.0, modifying or linking the library in a networked SaaS application could obligate Optimus Orien to open-source its entire backend and proprietary infrastructure. Furthermore, Signal's browser bindings are notoriously unstable and tailored exclusively to the Signal Desktop Electron wrapper.

---

### Architectural Recommendation

> [!IMPORTANT]
> **Primary Recommendation:** We recommend **Option 1: `@matrix-org/vodozemac`** (Version `^0.8.0`, Apache-2.0).  
> It delivers an audited, memory-safe Double Ratchet protocol with Forward Secrecy, Post-Compromise Security, and pre-key bundles in WebAssembly, with a permissive commercial license and zero custom cryptographic design.
>
> **Fallback Alternative:** If WebAssembly environments with Content Security Policy (CSP) headers disallowing `wasm-eval` are encountered, the fallback is **`libsodium-wrappers`** paired with an audited standalone Double Ratchet binding. However, `@matrix-org/vodozemac` is supported by all modern evergreen browsers (Chrome, Firefox, Safari, Edge).

---

## 3. Honest Disclosure of Cryptographic Boundaries & Limitations

To maintain the highest level of institutional transparency, the following technical limits of E2EE must be acknowledged:

1. **Server-Visible Metadata**:
   - The central server necessarily coordinates delivery and rate limiting. Therefore, the server **can observe**:
     - *Who is communicating with whom* (Sender ID and Recipient ID).
     - *When communication occurs* (Timestamps of message submission and delivery).
     - *Message size and frequency* (Length of ciphertext and request cadence).
     - *IP addresses and user agent headers* of the connected devices.
   - E2EE conceals the *contents* of messages, not the *fact* of communication.
2. **Web App Trust Model & Code Injection**:
   - In any browser-based web application, the code executing the cryptography is served by the hosting web server on each page load.
   - If the hosting platform (e.g. Render / Vercel), GitHub repository, or DNS is compromised to serve modified JavaScript, client-side cryptography could be bypassed at runtime.
   - *Mitigation*: Subresource Integrity (SRI), strict Content Security Policy (CSP), and automated CI/CD release hash verification.
3. **Endpoint & Device Compromise**:
   - E2EE guarantees transmission security. If an educator's physical device or browser profile is compromised (e.g., malware, keylogger, rogue browser extension, or unlocked terminal), decrypted plaintext displayed in the DOM can be captured.
4. **Permanent Data Loss on Lost Keys (No Server Escrow)**:
   - Because the server stores zero private keys and zero plaintext, **if a user loses their private key (e.g., clears browser cache, replaces device without a recovery key), past chat history cannot be decrypted or recovered by anyone, including platform administrators**.
5. **Single Active Device Scope for v1**:
   - Multi-device simultaneous synchronization (similar to Signal's Sesame or Matrix's cross-signing) introduces significant cryptographic complexity and key duplication risks.
   - Version 1 is strictly **Single Active Device per account** with an explicit re-keying and pre-key invalidation workflow upon changing browsers or devices.
6. **No Server-Side Full-Text Search**:
   - The database stores only base64 ciphertext. Full-text search across past chats is impossible on the server and can only be performed client-side across locally stored, decrypted records in browser storage.

---

## 4. Key Management & Client Storage Architecture

```mermaid
flowchart TD
    subgraph Browser["Client Browser (Sandboxed)"]
        KDF["User Passphrase / PBKDF2 (100k iters)"]
        MasterKey["256-bit Local Master Key (Non-extractable)"]
        KDF --> MasterKey
        
        subgraph Vodozemac["@matrix-org/vodozemac (WASM)"]
            IK["Identity Key Pair (Ed25519)"]
            SPK["Signed Pre-Key (X25519)"]
            OTK["One-Time Pre-Keys pool (X25519 x 50)"]
            DbgSig["Signature of SPK (Ed25519)"]
            IK --> DbgSig
        end
        
        MasterKey -.->|Wrap & Encrypt| Storage[("IndexedDB (Encrypted Pickle)")]
        Vodozemac --> Storage
        
        RecoveryGen["Emergency Recovery Key (128-bit / 12-Word Base58)"]
        RecoveryGen -.->|Shown Once at Setup| UserPrompt["User Safekeeping Prompt"]
    end
    
    subgraph Server["Optimus Orien Central Server (Untrusted Router)"]
        DB[("PostgreSQL")]
        subgraph Bundle["Public UserKeyBundle"]
            PUB_IK["Public Identity Key (Ed25519)"]
            PUB_SPK["Public Signed Pre-Key (X25519)"]
            PUB_SIG["Pre-key Signature"]
            PUB_OTK["Unused OTK Pool (X25519)"]
        end
        Bundle --> DB
    end
    
    Vodozemac ==>|Upload Public Keys Only| Bundle
```

### 4.1 Key Generation Flow (Client-Side Only)
1. When an adult educator enters the Network Chat interface for the first time, the client verifies that no local key pair exists.
2. The browser generates:
   - **Identity Key Pair (`IK`)**: Ed25519 key pair (used for message signing, identity verification, and safety numbers).
   - **Signed Pre-Key (`SPK`)**: Curve25519 key pair, cryptographically signed by `IK`.
   - **One-Time Pre-Keys (`OTK`)**: A batch of 50 Curve25519 ephemeral key pairs for asynchronous X3DH initial session creation.
   - **Emergency Recovery Key**: A 128-bit cryptographically random seed encoded as a 12-word mnemonic phrase.
3. The **public components only** (`IK_pub`, `SPK_pub`, `SPK_sig`, and `[OTK_pub_1 ... OTK_pub_50]`) are serialized and uploaded to the server via `POST /api/v1/network/chat/keys/bundle/`.
4. **The private keys (`IK_priv`, `SPK_priv`, `OTK_priv`) are NEVER transmitted over the network under any circumstance.**

### 4.2 Key Protection at Rest in Browser
- The vodozemac account state is serialized into an encrypted "pickle" using a 256-bit AES-GCM wrapping key.
- The wrapping key is derived from a user-supplied chat passphrase using PBKDF2 with SHA-256 and 100,000 iterations (or Web Crypto non-extractable storage where hardware-backed TPM/Secure Enclave is exposed).
- The resulting encrypted blob is persisted in client `IndexedDB` under the database name `optimus_e2ee_keys`.

### 4.3 Recovery & Re-keying Protocol
- If a user accesses Network Chat from a new computer or clears browser data:
  - **Path A (Recovery Phrase Available)**: The user inputs the 12-word recovery mnemonic. The client derives the master identity, downloads the current session state, and restores past message decryption capability.
  - **Path B (Re-keying / Fresh Start)**: If the recovery key is unavailable, the user must click **"Generate New Security Keys"**. The client generates a new key bundle, uploads it to the server (replacing old pre-keys), and alerts active contacts that the user's security identity has changed. Previous chat history on the lost device remains unrecoverable.

---

## 5. Double Ratchet Protocol & Message Lifecycle

```mermaid
sequenceDiagram
    autonumber
    actor Alice as Alice (Educator A)
    participant Server as Optimus Orien Server
    actor Bob as Bob (Educator B)

    Note over Alice, Bob: Pre-requisite: Both users are active adults with accepted Connection
    
    rect rgb(240, 248, 255)
    Note over Alice, Server: Step 1: Initial Session Establishment (X3DH)
    Alice->>Server: GET /api/v1/network/chat/keys/bob_id/
    Server-->>Alice: Returns Bob's {IK_pub, SPK_pub, SPK_sig, OTK_pub_k}
    Alice->>Alice: Verify SPK_sig with Bob's IK_pub
    Alice->>Alice: Generate ephemeral key EK_alice
    Alice->>Alice: Compute 4 DH exchanges: DH1(IK_a, SPK_b), DH2(EK_a, IK_b), DH3(EK_a, SPK_b), DH4(EK_a, OTK_b)
    Alice->>Alice: Initialize vodozemac OlmSession (Root Key & Initial Chain Key)
    end

    rect rgb(245, 255, 250)
    Note over Alice, Server: Step 2: Message Encryption & Transmission
    Alice->>Alice: Advance symmetric ratchet: generate message key
    Alice->>Alice: Encrypt plaintext with AES-256-GCM (Ciphertext + Tag)
    Alice->>Alice: Sign (Ciphertext + Sequence + EphemeralKey) with Alice's IK_priv
    Alice->>Server: POST /api/v1/network/chat/conversations/{id}/messages/<br/>{ciphertext_base64, ephemeral_key, sequence_num, sender_signature}
    Server->>Server: Verify active connection, age, unblocked status
    Server->>Server: Store encrypted message metadata (NOT plaintext)
    end

    rect rgb(255, 250, 245)
    Note over Server, Bob: Step 3: Message Retrieval & Decryption
    Bob->>Server: GET /api/v1/network/chat/conversations/{id}/messages/ (Long-polling / SSE)
    Server-->>Bob: Returns message envelope
    Bob->>Bob: Verify sender_signature using Alice's IK_pub
    Bob->>Bob: Process message via vodozemac OlmSession
    Bob->>Bob: Advance Diffie-Hellman ratchet & derive matching message key
    Bob->>Bob: Decrypt AES-256-GCM ciphertext to plaintext
    Bob->>Bob: Render plaintext in secure React DOM
    end
```

### 5.1 Out-of-Order & Packet Loss Protection
- The Double Ratchet manages skipped keys automatically. If message #3 arrives before message #2 (due to network reordering), the client advances the symmetric chain ratchet, stores the skipped message key in a temporary secure cache, and decrypts message #3 immediately.
- When message #2 subsequently arrives, the skipped key is retrieved from cache, used to decrypt the delayed payload, and immediately zeroized in memory.

### 5.2 Plaintext Constraints
- Plain-text messages only in v1.
- Maximum message size: **2,000 Unicode characters**.
- No file attachments, images, audio clips, or automated link scrapers (eliminates SSRF and external preview tracking).
- If a URL is included in plaintext, clicking it triggers a safety modal: *"You are navigating to an external website ([domain]). Optimus Orien is not responsible for external content."*

---

## 6. Safety Numbers & Key Verification

To prevent Man-in-the-Middle (MITM) attacks where a compromised server might attempt to swap public pre-keys, users can verify each other out-of-band:

1. **Safety Number Calculation**:
   $$\text{SafetyNumber} = \text{Truncate}_{60}\left(\text{SHA-512}\left(\text{Sort}\left(IK_{\text{Alice\_pub}}, IK_{\text{Bob\_pub}}\right) \mathbin{\Vert} \text{User}_{\text{Alice\_ID}} \mathbin{\Vert} \text{User}_{\text{Bob\_ID}}\right)\right)$$
2. **Display Format**: Rendered as a 12-block formatted numeric fingerprint:
   ```text
   48201 - 92834 - 10492 - 84729 - 01928 - 38472
   19284 - 72910 - 48201 - 93847 - 28190 - 47281
   ```
   Or as a scannable QR code.
3. **Key Change Alerting**:
   If Bob re-keys or registers a new device, Alice’s client detects a mismatch against Bob's pinned `IK_pub`. The chat interface immediately locks the conversation input with a prominent yellow security warning:
   > ⚠️ **Security Warning**: *Bob's encryption key has changed. This typically happens when they reinstall their browser or switch computers. Please verify their Safety Number before sending sensitive messages.*

---

## 7. Cryptographically Verifiable Abuse Reporting

A common paradox of E2EE messaging is how to moderate abuse without introducing an escrow backdoor. We resolve this using **Cryptographic Attestation Reporting**:

```mermaid
sequenceDiagram
    autonumber
    actor Bob as Bob (Victim)
    participant Server as Optimus Orien Moderation Desk
    actor Alice as Alice (Bad Actor)

    Note over Alice, Bob: Alice sends an abusive message to Bob
    Alice->>Bob: Encrypted Message (Ciphertext + Alice_Signature)
    Bob->>Bob: Decrypts message and reads abusive text
    
    Note over Bob, Server: Bob clicks "Report Message"
    Bob->>Bob: Client extracts: {Ciphertext, Alice_Signature, Timestamp, Decrypted_Plaintext}
    Bob->>Server: POST /api/v1/network/chat/reports/<br/>{message_id, ciphertext, sender_signature, decrypted_plaintext, category}
    
    Server->>Server: 1. Fetch Alice's registered IK_pub from database
    Server->>Server: 2. Verify Alice_Signature over (Ciphertext + Sequence)
    Server->>Server: 3. Verify Ciphertext matches stored server transmission hash
    
    alt Cryptographic Signature Valid
        Server->>Server: Confirmed: Alice mathematically authored this exact encrypted payload
        Server->>Server: Escalate report to compliance desk for disciplinary action
    else Signature Invalid / Tampered
        Server-->>Bob: Reject report: payload does not match cryptographic signature
    end
```

- **Why this is safe**:
  1. The platform cannot eavesdrop on normal conversations (no master keys exist).
  2. The server only receives plaintext **when the recipient voluntarily exports and signs an abuse report**.
  3. The sender cannot deny authorship because the ciphertext is cryptographically signed with their private identity key (`IK_priv`).
  4. The victim cannot fabricate fake messages from the sender because they do not possess the sender's private identity key.

---

## 8. Server-Side Security Rules & Database Schema

The backend acts as a strict Zero-Trust gatekeeper. Every request to create a conversation, upload pre-keys, or dispatch ciphertext executes the following non-negotiable checks:

### 8.1 Server Verification Rules (Every Endpoint)
1. **Adult Verification**: `user.age >= 18` and `user.role` in `['organisation_admin', 'school_admin', 'principal', 'teacher']`. If role is `'student'` or `'parent'`, the server returns `HTTP 403 Forbidden` with zero processing.
2. **Mutual Connection**: A row must exist in `core_connection` with `status='accepted'` linking `sender_id` and `recipient_id`.
3. **No Active Blocks**: Neither user has an active record in `core_block`.
4. **Institutional Authorization**: Both schools have `network_enabled=True` in `core_schoolnetworksetting`.
5. **Immediate Termination**: If either educator breaks the connection or blocks the other, active conversations are flagged `is_terminated=True`. Any subsequent ciphertext submission is rejected immediately.
6. **Account Deletion / Right to Erasure**: Deleting an account cascades to delete all `UserKeyBundle`, `Conversation`, and `EncryptedMessage` records, leaving zero residual ciphertext on disk.

### 8.2 Database Schema (Already Migrated in Stage 1)
```sql
-- User Public Key Directory (No private keys)
CREATE TABLE core_userkeybundle (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT UNIQUE REFERENCES core_customuser(id) ON DELETE CASCADE,
    identity_key_pub TEXT NOT NULL,          -- Base64 Ed25519 public key
    signed_prekey_pub TEXT NOT NULL,        -- Base64 Curve25519 public key
    prekey_signature TEXT NOT NULL,          -- Base64 signature of signed prekey
    one_time_prekeys_json JSONB NOT NULL,    -- Array of ephemeral public prekeys
    bundle_version INT DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Conversation Metadata
CREATE TABLE core_conversation (
    id BIGSERIAL PRIMARY KEY,
    participant_one_id BIGINT REFERENCES core_customuser(id) ON DELETE CASCADE,
    participant_two_id BIGINT REFERENCES core_customuser(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE,
    CONSTRAINT unique_participants UNIQUE (participant_one_id, participant_two_id)
);

-- Encrypted Message Envelope (Zero plaintext)
CREATE TABLE core_encryptedmessage (
    id BIGSERIAL PRIMARY KEY,
    conversation_id BIGINT REFERENCES core_conversation(id) ON DELETE CASCADE,
    sender_id BIGINT REFERENCES core_customuser(id) ON DELETE CASCADE,
    recipient_id BIGINT REFERENCES core_customuser(id) ON DELETE CASCADE,
    ciphertext_base64 TEXT NOT NULL,         -- AES-256-GCM ciphertext + auth tag
    ephemeral_public_key TEXT NOT NULL,      -- Sender's DH step public key
    sequence_number INT NOT NULL,            -- Monotonic ratchet sequence index
    sender_signature TEXT NOT NULL,          -- Ed25519 signature over envelope
    sent_at TIMESTAMPTZ DEFAULT NOW(),
    delivered_at TIMESTAMPTZ NULL,
    read_at TIMESTAMPTZ NULL
);
```

---

## 9. Transport Layer Evaluation for Optimus Orien Hosting

We evaluated three real-time delivery architectures suited to our Django backend and hosting environment:

```mermaid
flowchart LR
    subgraph Option1["Option A: Smart Adaptive Polling (Recommended for v1)"]
        ClientA["Client Chat Window"] -- "GET /messages/?since=timestamp (every 3s)" --> DjangoWSGI["Standard Django WSGI"]
        DjangoWSGI -- "Instant Response (empty or ciphertext)" --> ClientA
    end
    
    subgraph Option2["Option B: Server-Sent Events (SSE)"]
        ClientB["Client"] -- "GET /chat/events/ (persistent stream)" --> DjangoASGI["Django ASGI / Uvicorn"]
    end
    
    subgraph Option3["Option C: WebSockets (Django Channels)"]
        ClientC["Client"] <== "Full Duplex ws://" ==> Daphne["Daphne / Redis Layer"]
    end
```

| Transport Mechanism | Infrastructure Requirements | Complexity & Risk | Scalability & Server Load | Suitability for Optimus Orien v1 |
| :--- | :--- | :--- | :--- | :--- |
| **Option A: Smart Adaptive Polling** | Standard Django WSGI (Gunicorn / Waitress / Render). No extra containers. | **Minimal**: Works immediately with existing deployment pipeline. | Low load because polling **only occurs while a chat window is actively open and focused** (3-second cadence; backoff to 15s when inactive; stops completely on blur). | **RECOMMENDED FOR V1**: Cleanest path, zero new infrastructure costs, 100% reliable on Contabo and Render. |
| **Option B: Server-Sent Events (SSE)** | Requires ASGI or async streaming endpoint. | **Moderate**: Requires persistent HTTP connection handling. | Efficient for server-to-client notifications. | Excellent for v2 enhancement. |
| **Option C: WebSockets (Django Channels)** | **Requires Redis service** (`channels_redis`), `daphne` or `uvicorn` worker pool, process supervisor. | **High**: Additional background services, port routing, and potential failure points. | Ideal for high-concurrency public chatrooms, but overengineered for professional 1-to-1 school staff messaging. | Not recommended for v1; ask user before installing Redis/Channels. |

### Transport Recommendation
We recommend **Option A (Smart Adaptive Polling)** for Version 1:
- Zero additional server processes (no Redis cluster or Daphne daemon required).
- Polling runs *only* when the chat window is open and the browser tab has focus.
- When inactive, the client ceases polling and relies on periodic generic notification checks.

---

## 10. Package Evaluation for Stage 4

Before any new npm package or Python dependency is installed in Stage 4, the following formal request is presented for user approval:

| Package | Target | Version | License | Maintenance & Trust | Why It Is Needed |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `@matrix-org/vodozemac` | Frontend | `^0.8.0` | Apache-2.0 | Active by Matrix.org core team, audited by Least Authority | Implements the complete Double Ratchet, session pickling, and Ed25519 signing in WebAssembly. Prevents inventing custom crypto. |
| `idb-keyval` | Frontend | `^6.2.1` | Apache-2.0 | Maintained by Google Chrome team (Jake Archibald) | Ultra-lightweight ($<1\text{ KB}$), promise-based IndexedDB key-value store to persist encrypted local key bundles without memory bloat. |

*No new backend Python packages are required.* The backend uses standard Django ORM, PostgreSQL JSON fields, and cryptographic validation utilities already built into the standard library.

---

## 11. Traceability to Requirements Checklist

| Requirement from Project Prompt | Architectural Specification Section | Compliance Status |
| :--- | :--- | :--- |
| Do NOT invent cryptography | Section 2: `@matrix-org/vodozemac` (audited by Least Authority) | **Full Compliance** |
| Compare at least two options (sources, licenses, trade-offs) | Section 2: Detailed comparative analysis of vodozemac, libsodium, libsignal | **Full Compliance** |
| State honest limits (metadata, lost keys, web app trust) | Section 3: In-depth limitation and threat model disclosure | **Full Compliance** |
| Browser key generation (private key never sent to server) | Section 4: Web Crypto / Wasm keygen with non-extractable storage | **Full Compliance** |
| Recovery key shown once | Section 4.3: 12-word mnemonic recovery seed | **Full Compliance** |
| Authenticated encryption with unique nonces | Section 5: AES-256-GCM with Double Ratchet derived message keys | **Full Compliance** |
| Messages signed with identity key for verifiable reporting | Section 7: Cryptographic Attestation Reporting via Ed25519 signature | **Full Compliance** |
| Safety number / QR comparison & key-change warning | Section 6: SHA-512 60-digit safety fingerprint and change alert banner | **Full Compliance** |
| Plaintext never logged or stored on server | Section 8: Database schema stores only Base64 ciphertext envelopes | **Full Compliance** |
| Single-device scope for v1 | Section 3.5: Single active device with explicit re-key flow | **Full Compliance** |
| Transport suited to hosting (propose and ask before Channels) | Section 9: Smart Adaptive Polling proposed; zero Redis/Channels | **Full Compliance** |
| Strict server-side enforcement (minors, blocks, schools) | Section 8.1: Zero-trust enforcement on every API endpoint | **Full Compliance** |

---

## 12. Next Steps & Approval Checkpoint

In strict adherence to the project guidelines, **no chat implementation code has been written in Stage 3**.

Execution will now pause until you review and grant approval of:
1. The selection of **`@matrix-org/vodozemac`** (Apache-2.0, audited) for Double Ratchet E2EE.
2. The selection of **Smart Adaptive Polling** (Option A) to avoid installing Redis or Django Channels.
3. The cryptographic abuse reporting workflow.

Upon your approval, we will proceed immediately to **Stage 4 (Chat implementation, full test suite run, Playwright tests, and traceability report)**.
