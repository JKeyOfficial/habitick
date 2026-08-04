import { useState, useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { supabase } from '../lib/supabase.js';
import { encryptQrPayload, deriveShortCode } from '../utils/qrCrypto.js';

export function QrScannerModal({ onClose, showToast }) {
  const [mode, setMode] = useState("camera"); // "camera" | "code"
  const [manualCode, setManualCode] = useState("");
  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [pendingAuth, setPendingAuth] = useState(null); // { sessionId, publicKeyJwk, exp }
  const [authorizing, setAuthorizing] = useState(false);
  const [manualCodeErr, setManualCodeErr] = useState("");

  const html5QrCodeRef = useRef(null);
  const fileInputRef = useRef(null);

  // Handle scanned QR payload (from camera or photo upload)
  const processQrText = (decodedText) => {
    try {
      const data = JSON.parse(decodedText);
      if (data && data.id && data.pub) {
        if (data.exp && Date.now() > data.exp) {
          showToast("Scanned QR Code has expired. Please refresh the login screen.", "error");
          return;
        }
        // Stop scanning and trigger security confirmation dialog
        stopCamera();
        setPendingAuth({
          sessionId: data.id,
          publicKeyJwk: data.pub,
          exp: data.exp,
          shortCode: deriveShortCode(data.id)
        });
      } else {
        showToast("Invalid QR Code format", "error");
      }
    } catch (e) {
      showToast("Invalid HabiTick QR Code", "error");
    }
  };

  // Start live camera scanner
  const startCamera = async () => {
    setCameraError("");
    setScanning(true);
    try {
      if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
        await html5QrCodeRef.current.stop();
      }
      const html5QrCode = new Html5Qrcode("qr-camera-reader");
      html5QrCodeRef.current = html5QrCode;

      await html5QrCode.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 200, height: 200 } },
        (decodedText) => {
          processQrText(decodedText);
        },
        () => {
          // Frame scan failures are expected until code is centered
        }
      );
    } catch (err) {
      console.warn("Camera start error:", err);
      setCameraError("Camera permission denied or camera unavailable. Try uploading an image or entering the code manually.");
      setScanning(false);
    }
  };

  // Stop camera
  const stopCamera = async () => {
    if (html5QrCodeRef.current) {
      try {
        if (html5QrCodeRef.current.isScanning) {
          await html5QrCodeRef.current.stop();
        }
        html5QrCodeRef.current.clear();
      } catch (e) {
        console.warn("Error stopping camera:", e);
      }
      html5QrCodeRef.current = null;
    }
    setScanning(false);
  };

  useEffect(() => {
    if (mode === "camera" && !pendingAuth) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [mode, pendingAuth]);

  // Handle Image File Upload Scan
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const html5QrCode = new Html5Qrcode("hidden-file-qr-reader");
      const decodedText = await html5QrCode.scanFile(file, true);
      processQrText(decodedText);
      html5QrCode.clear();
    } catch (err) {
      showToast("Could not detect a valid QR code in selected photo", "error");
    }
  };

  // Authorize & Encrypt Auth Tokens for Target Session
  const handleApproveLogin = async () => {
    if (!pendingAuth) return;
    setAuthorizing(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session || !session.access_token || !session.refresh_token) {
        showToast("Active session invalid. Please re-login.", "error");
        setAuthorizing(false);
        return;
      }

      // Encrypt tokens with target public key
      const encryptedPackage = await encryptQrPayload(pendingAuth.publicKeyJwk, {
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        timestamp: Date.now()
      });

      // Broadcast payload to channel
      const targetChannel = supabase.channel(`qr-login-${pendingAuth.sessionId}`);
      await targetChannel.subscribe();
      await targetChannel.send({
        type: 'broadcast',
        event: 'e2ee_auth',
        payload: encryptedPackage
      });

      showToast("✓ Device authorized successfully!");
      onClose();
    } catch (err) {
      console.error("Failed to authorize login:", err);
      showToast("Failed to authorize sign-in request.", "error");
    } finally {
      setAuthorizing(false);
    }
  };

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      background: "rgba(0, 0, 0, 0.85)",
      backdropFilter: "blur(12px)",
      zIndex: 35000,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "20px"
    }}>
      {/* Hidden container for file scan */}
      <div id="hidden-file-qr-reader" style={{ display: "none" }}></div>

      <div style={{
        background: "#0d1117",
        border: "1px solid rgba(255, 255, 255, 0.1)",
        borderRadius: "20px",
        padding: "24px",
        width: "100%",
        maxWidth: "420px",
        boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.7)",
        color: "#f3f4f6",
        position: "relative"
      }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <div>
            <h3 style={{ margin: 0, fontSize: "18px", fontWeight: 800, color: "#fff" }}>
              {pendingAuth ? "Authorize Sign-In" : "Scan QR Login"}
            </h3>
            <span style={{ fontSize: "12px", color: "#60a5fa", fontWeight: 600 }}>
              🔒 Zero-Trust End-to-End Encrypted
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "rgba(255, 255, 255, 0.05)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              color: "#9ca3af",
              borderRadius: "10px",
              width: "32px",
              height: "32px",
              cursor: "pointer",
              fontSize: "16px"
            }}
          >
            ✕
          </button>
        </div>

        {/* Security Confirmation Prompt */}
        {pendingAuth ? (
          <div style={{ animation: "fadeIn 0.2s ease" }}>
            <div style={{
              background: "rgba(37, 99, 235, 0.1)",
              border: "1px solid rgba(59, 130, 246, 0.3)",
              borderRadius: "14px",
              padding: "16px",
              marginBottom: "20px",
              textAlign: "center"
            }}>
              <div style={{ fontSize: "32px", marginBottom: "8px" }}>📱 🔐 💻</div>
              <h4 style={{ margin: "0 0 6px", color: "#fff", fontSize: "16px", fontWeight: 700 }}>
                Authorize New Device?
              </h4>
              <p style={{ margin: 0, fontSize: "13px", color: "#9ca3af", lineHeight: 1.5 }}>
                A device on your network is requesting sign-in access. Only approve if you initiated this request.
              </p>

              <div style={{
                margin: "14px 0 0",
                padding: "8px 12px",
                background: "rgba(0,0,0,0.3)",
                borderRadius: "8px",
                fontSize: "12px",
                color: "#60a5fa",
                fontFamily: "monospace",
                fontWeight: 700,
                letterSpacing: "1px"
              }}>
                Pairing Code: {pendingAuth.shortCode}
              </div>
            </div>

            <div style={{ display: "flex", gap: "10px" }}>
              <button
                onClick={() => setPendingAuth(null)}
                disabled={authorizing}
                style={{
                  flex: 1,
                  padding: "12px",
                  borderRadius: "10px",
                  border: "1px solid #374151",
                  background: "transparent",
                  color: "#9ca3af",
                  fontWeight: 600,
                  fontSize: "14px",
                  cursor: "pointer"
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleApproveLogin}
                disabled={authorizing}
                style={{
                  flex: 1,
                  padding: "12px",
                  borderRadius: "10px",
                  border: "none",
                  background: "#2563eb",
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: "14px",
                  cursor: "pointer",
                  boxShadow: "0 4px 12px rgba(37, 99, 235, 0.4)",
                  opacity: authorizing ? 0.7 : 1
                }}
              >
                {authorizing ? "Encrypting..." : "✓ Approve & Authorize"}
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Mode Switcher */}
            <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
              <button
                onClick={() => setMode("camera")}
                style={{
                  flex: 1,
                  padding: "8px 12px",
                  borderRadius: "8px",
                  border: "1px solid",
                  borderColor: mode === "camera" ? "#2563eb" : "rgba(255,255,255,0.08)",
                  background: mode === "camera" ? "rgba(37, 99, 235, 0.15)" : "transparent",
                  color: mode === "camera" ? "#60a5fa" : "#6b7280",
                  fontWeight: 600,
                  fontSize: "13px",
                  cursor: "pointer"
                }}
              >
                📷 Live Camera
              </button>
              <button
                onClick={() => setMode("photo")}
                style={{
                  flex: 1,
                  padding: "8px 12px",
                  borderRadius: "8px",
                  border: "1px solid",
                  borderColor: mode === "photo" ? "#2563eb" : "rgba(255,255,255,0.08)",
                  background: mode === "photo" ? "rgba(37, 99, 235, 0.15)" : "transparent",
                  color: mode === "photo" ? "#60a5fa" : "#6b7280",
                  fontWeight: 600,
                  fontSize: "13px",
                  cursor: "pointer"
                }}
              >
                🖼️ Upload Photo
              </button>
            </div>

            {/* Mode Content */}
            {mode === "camera" && (
              <div>
                <div style={{
                  position: "relative",
                  width: "100%",
                  height: "240px",
                  borderRadius: "14px",
                  overflow: "hidden",
                  background: "#000",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center"
                }}>
                  <div id="qr-camera-reader" style={{ width: "100%", height: "100%" }}></div>

                  {cameraError && (
                    <div style={{
                      position: "absolute",
                      inset: 0,
                      background: "#0d1117",
                      padding: "20px",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      textAlign: "center"
                    }}>
                      <div style={{ color: "#ef4444", fontSize: "13px", marginBottom: "12px", lineHeight: 1.4 }}>
                        {cameraError}
                      </div>
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        style={{
                          padding: "8px 16px",
                          borderRadius: "8px",
                          border: "none",
                          background: "#2563eb",
                          color: "#fff",
                          fontWeight: 600,
                          fontSize: "13px",
                          cursor: "pointer"
                        }}
                      >
                        Upload QR Image Instead
                      </button>
                    </div>
                  )}
                </div>

                <div style={{ textAlign: "center", marginTop: "14px" }}>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    style={{ background: "none", border: "none", color: "#3b82f6", fontSize: "13px", cursor: "pointer", textDecoration: "underline" }}
                  >
                    Select photo from library
                  </button>
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept="image/*"
                    onChange={handleFileUpload}
                    style={{ display: "none" }}
                  />
                </div>
              </div>
            )}

            {mode === "photo" && (
              <div style={{
                border: "2px dashed rgba(255, 255, 255, 0.15)",
                borderRadius: "14px",
                padding: "36px 20px",
                textAlign: "center",
                background: "rgba(255, 255, 255, 0.02)"
              }}>
                <div style={{ fontSize: "36px", marginBottom: "12px" }}>📸</div>
                <div style={{ fontSize: "14px", color: "#f3f4f6", fontWeight: 600, marginBottom: "4px" }}>
                  Select a screenshot or photo of QR code
                </div>
                <div style={{ fontSize: "12px", color: "#6b7280", marginBottom: "16px" }}>
                  Supports PNG, JPG, WebP
                </div>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    padding: "10px 20px",
                    borderRadius: "10px",
                    border: "none",
                    background: "#2563eb",
                    color: "#fff",
                    fontWeight: 700,
                    fontSize: "14px",
                    cursor: "pointer"
                  }}
                >
                  Choose Image File
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/*"
                  onChange={handleFileUpload}
                  style={{ display: "none" }}
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
