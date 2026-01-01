
import React, { useState } from 'react';
import { User, UserPlus } from 'lucide-react';

interface ContactAvatarProps {
    photoUrl?: string;
    themeColor: string;
    size?: 'sm' | 'md' | 'lg' | 'xl';
    isModal?: boolean;
}

const ContactAvatar: React.FC<ContactAvatarProps> = ({ photoUrl, themeColor, size = 'md', isModal = false }) => {
    const [imageError, setImageError] = useState(false);

    // Size classes mapping
    const sizeClasses = {
        sm: 'w-10 h-10 rounded-xl',
        md: 'w-16 h-16 rounded-[24px]',
        lg: 'w-24 h-24 rounded-[36px]',
        xl: 'w-32 h-32 rounded-[40px]'
    };

    const iconSizes = {
        sm: 18,
        md: 30,
        lg: 40,
        xl: 48
    };

    const containerClasses = `flex items-center justify-center border-4 border-slate-50 bg-slate-50 text-${themeColor}-500 shadow-inner overflow-hidden transition-all duration-500 ${sizeClasses[size]} ${!isModal ? 'group-hover:scale-110' : ''} ${isModal ? 'rotate-6 shadow-2xl' : ''}`;

    if (photoUrl && !imageError) {
        return (
            <div className={containerClasses}>
                <img
                    src={photoUrl}
                    alt="Contact"
                    className="w-full h-full object-cover"
                    onError={() => setImageError(true)}
                />
            </div>
        );
    }

    // Fallback Icon
    const Icon = isModal ? UserPlus : User;

    return (
        <div className={`${containerClasses} ${isModal ? `bg-gradient-to-tr from-${themeColor}-500 to-${themeColor}-600 text-white` : ''}`}>
            <Icon size={iconSizes[size]} strokeWidth={isModal ? 3 : 2.5} />
        </div>
    );
};

export default ContactAvatar;
