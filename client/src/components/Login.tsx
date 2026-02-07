import React from "react";
import { QRCodeSVG } from "qrcode.react";
import { ConnectionState } from "../App";
import { CheckCircle } from "lucide-react";

interface LoginProps {
  connectionState: ConnectionState;
}

export function Login({ connectionState }: LoginProps) {
  return (
    <div className="max-w-md mx-auto">
      {/* WhatsApp Connection */}
      <div className="flex flex-col items-center justify-center bg-white p-8 rounded-xl shadow-sm border border-gray-200">
        <div className="flex items-center gap-2 mb-6">
          <h2 className="text-2xl font-semibold">Connect WhatsApp</h2>
          {connectionState.whatsapp && (
            <CheckCircle className="text-green-500" size={24} />
          )}
        </div>
        {connectionState.whatsapp ? (
          <div className="w-64 h-64 flex flex-col items-center justify-center text-green-600 bg-green-50 rounded-lg">
            <CheckCircle size={64} className="mb-4" />
            <span className="text-lg font-medium">Connected!</span>
          </div>
        ) : (
          <>
            <div className="bg-gray-50 p-4 rounded-lg mb-6">
              {connectionState.whatsappQr ? (
                <QRCodeSVG value={connectionState.whatsappQr} size={256} />
              ) : (
                <div className="w-64 h-64 flex items-center justify-center text-gray-400">
                  Waiting for QR Code...
                </div>
              )}
            </div>
            <p className="text-gray-600 text-center max-w-md">
              Open WhatsApp on your phone, go to Settings {">"} Linked Devices,
              and scan the QR code to connect.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
