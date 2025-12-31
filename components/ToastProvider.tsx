import React, { createContext, useContext, useState, useCallback } from 'react';
import { X, CheckCircle, AlertTriangle, Info, Bell } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info' | 'message';

interface ToastOptions {
    description?: string;
    duration?: number;
}

interface Toast extends ToastOptions {
    id: string;
    message: string;
    type: ToastType;
}

interface ToastContextType {
    showToast: (message: string, type: ToastType) => void;
    toast: {
        success: (message: string, options?: ToastOptions) => void;
        error: (message: string, options?: ToastOptions) => void;
        info: (message: string, options?: ToastOptions) => void;
        message: (message: string, options?: ToastOptions) => void;
    }
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const useToast = () => {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context;
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const addToast = useCallback((message: string, type: ToastType, options?: ToastOptions) => {
        const id = Math.random().toString(36).substring(2, 9);
        const duration = options?.duration || 5000;

        setToasts((prev) => [...prev, { id, message, type, ...options }]);

        if (duration !== Infinity) {
            setTimeout(() => {
                setToasts((prev) => prev.filter((t) => t.id !== id));
            }, duration);
        }
    }, []);

    // Backward compatibility
    const showToast = useCallback((message: string, type: ToastType) => {
        addToast(message, type);
    }, [addToast]);

    // Sonner-like API
    const toast = {
        success: (message: string, options?: ToastOptions) => addToast(message, 'success', options),
        error: (message: string, options?: ToastOptions) => addToast(message, 'error', options),
        info: (message: string, options?: ToastOptions) => addToast(message, 'info', options),
        message: (message: string, options?: ToastOptions) => addToast(message, 'message', options),
    };

    const removeToast = (id: string) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    };

    const icons = {
        success: <CheckCircle className="w-5 h-5 text-emerald-500" />,
        error: <AlertTriangle className="w-5 h-5 text-rose-500" />,
        info: <AlertTriangle className="w-5 h-5 text-indigo-500" />,
        message: <Bell className="w-5 h-5 text-slate-900" />
    };

    const borderColors = {
        success: 'border-emerald-500',
        error: 'border-rose-500',
        info: 'border-indigo-500',
        message: 'border-slate-900'
    }

    return (
        <ToastContext.Provider value={{ showToast, toast }}>
            {children}
            <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-3 pointer-events-none">
                {toasts.map((t) => (
                    <div
                        key={t.id}
                        className={`pointer-events-auto min-w-[320px] max-w-sm bg-white p-5 rounded-2xl shadow-2xl border-l-4 ${borderColors[t.type]} flex items-start gap-4 animate-in slide-in-from-right-full duration-500`}
                    >
                        <div className="mt-0.5 shrink-0">{icons[t.type]}</div>
                        <div className="flex-1 space-y-1">
                            <p className="text-sm font-black text-slate-800 leading-tight">{t.message}</p>
                            {t.description && (
                                <p className="text-[11px] font-medium text-slate-500 leading-relaxed text-balance">
                                    {t.description}
                                </p>
                            )}
                        </div>
                        <button onClick={() => removeToast(t.id)} className="text-slate-300 hover:text-slate-500 transition-colors -mt-1 -mr-2 p-2">
                            <X size={16} />
                        </button>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
};
