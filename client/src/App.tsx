import React, { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { GoogleLogin } from './components/GoogleLogin';
import { Dashboard } from './components/Dashboard';

const API_URL = process.env.REACT_APP_API_URL || ''; // Empty string means relative path for proxy
export const socket: Socket = io(API_URL, { 
    autoConnect: false,
    withCredentials: true 
});

export type Platform = 'whatsapp';

export interface ConnectionState {
    whatsapp: boolean;
    whatsappQr: string | null;
}

function App() {
    const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
    const [user, setUser] = useState<any>(null);
    const [isConnected, setIsConnected] = useState(false);
    const [connectionState, setConnectionState] = useState<ConnectionState>({
        whatsapp: false,
        whatsappQr: null
    });

    useEffect(() => {
        // Check Auth Status
        fetch('/api/auth/status')
            .then(res => res.json())
            .then(data => {
                setIsAuthenticated(data.authenticated);
                if (data.authenticated) {
                    setUser(data.user);
                    if (!socket.connected) socket.connect();
                }
            })
            .catch(() => setIsAuthenticated(false));
    }, []);

    const handleLogout = () => {
        fetch('/api/auth/logout', { method: 'POST' })
            .then(() => {
                window.location.reload();
            });
    };

    useEffect(() => {
        if (!isAuthenticated) return;

        function onConnect() {
            setIsConnected(true);
        }

        function onDisconnect() {
            setIsConnected(false);
            setConnectionState({
                whatsapp: false,
                whatsappQr: null
            });
        }

        function onWhatsAppConnectionOpen() {
            setConnectionState(prev => ({ ...prev, whatsapp: true, whatsappQr: null }));
        }

        function onWhatsAppQr(qr: string) {
            console.log('[WHATSAPP] Received QR code');
            setConnectionState(prev => ({ ...prev, whatsappQr: qr }));
        }

        socket.on('connect', onConnect);
        socket.on('disconnect', onDisconnect);
        socket.on('qr', onWhatsAppQr);
        socket.on('connection-open', onWhatsAppConnectionOpen);
        
        // Error handling
        socket.on('connect_error', (err) => {
            console.error('Socket connection error:', err);
             if (err.message === 'Unauthorized') {
                 setIsAuthenticated(false);
             }
        });

        if (!socket.connected) {
            socket.connect();
        }

        return () => {
            socket.off('connect', onConnect);
            socket.off('disconnect', onDisconnect);
            socket.off('qr', onWhatsAppQr);
            socket.off('connection-open', onWhatsAppConnectionOpen);
            socket.off('connect_error');
        };
    }, [isAuthenticated]);

    if (isAuthenticated === null) {
        return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
    }

    if (!isAuthenticated) {
        // Handle error param from URL
        const urlParams = new URLSearchParams(window.location.search);
        const error = urlParams.get('error') || undefined;
        return <GoogleLogin error={error} />;
    }

    return (
        <div className="min-h-screen bg-gray-100 p-8">
            <div className="max-w-6xl mx-auto">
                <header className="mb-8 flex justify-between items-center bg-white p-4 rounded-xl shadow-sm">
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <span className="text-blue-600">Whats</span>Trax
                    </h1>
                    <div className="flex items-center gap-6">
                        <div className="flex items-center gap-2">
                            <div className={`w-2.5 h-2.5 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'} animate-pulse`} />
                            <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">{isConnected ? 'Online' : 'Offline'}</span>
                        </div>
                        
                        <div className="h-4 w-px bg-gray-200" />
                        
                        <div className="flex items-center gap-3">
                             {user?.photos?.[0]?.value && (
                                <img src={user.photos[0].value} alt="Profile" className="w-8 h-8 rounded-full border border-gray-200" />
                             )}
                             <span className="text-sm font-medium text-gray-700">{user?.displayName}</span>
                        </div>
                        
                        <button 
                            onClick={handleLogout} 
                            className="text-sm text-red-600 hover:text-red-700 font-medium px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
                        >
                            Logout
                        </button>
                    </div>
                </header>

                <main>
                    <Dashboard connectionState={connectionState} />
                </main>
            </div>
        </div>
    );
}

export default App;
