import React from 'react';
import { motion, AnimatePresence } from "framer-motion";
import { Button } from '../ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { LogOut, User } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { ProfileModal } from '../ProfileModal';

export const UserMenu: React.FC = () => {
  const { user, logout } = useAuth();
  
  // Use React.useState directly to avoid import issues
  const [isProfileModalOpen, setIsProfileModalOpen] = React.useState(false);

  if (!user) {
    return null;
  }

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const handleProfileClick = () => {
    setIsProfileModalOpen(true);
  };

  const displayName = user.firstName && user.lastName 
    ? `${user.firstName} ${user.lastName}`
    : user.username || user.email;

  const initials = user.firstName && user.lastName
    ? `${user.firstName[0]}${user.lastName[0]}`
    : user.username
    ? user.username[0].toUpperCase()
    : user.email[0].toUpperCase();

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button 
            variant="ghost" 
            className="relative h-8 w-8 rounded-full bg-slate-800/50 hover:bg-slate-700/50 border border-slate-600/50 backdrop-blur-xl transition-all duration-200 hover:scale-105 active:scale-95"
          >
            <Avatar className="h-8 w-8">
              <AvatarImage src={user.avatar || undefined} alt={displayName} />
              <AvatarFallback className="bg-gradient-to-br from-violet-500/20 to-purple-600/20 text-white border border-violet-400/30">
                {initials}
              </AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent 
          className="w-56 bg-slate-900/90 backdrop-blur-xl border border-slate-700/50 rounded-xl" 
          align="end" 
          forceMount
        >
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col space-y-1">
              <p className="text-sm font-medium leading-none text-white">{displayName}</p>
              <p className="text-xs leading-none text-slate-400">
                {user.email}
              </p>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator className="border-slate-700" />
          <DropdownMenuItem 
            onClick={handleProfileClick}
            className="text-slate-300 hover:text-white hover:bg-slate-800/50 focus:bg-slate-800/50 focus:text-white cursor-pointer"
          >
            <User className="mr-2 h-4 w-4" />
            <span>Profile</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator className="border-slate-700" />
          <DropdownMenuItem 
            onClick={handleLogout}
            className="text-slate-300 hover:text-white hover:bg-slate-800/50 focus:bg-slate-800/50 focus:text-white cursor-pointer"
          >
            <LogOut className="mr-2 h-4 w-4" />
            <span>Log out</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ProfileModal 
        open={isProfileModalOpen} 
        onOpenChange={setIsProfileModalOpen} 
      />
    </>
  );
}; 