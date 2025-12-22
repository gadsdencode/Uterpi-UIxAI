// TeamsModal.tsx - Team management as a modal popup
// Manage team members and shared resources

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Users, 
  UserPlus, 
  Crown,
  Shield,
  User,
  MoreVertical,
  Trash2,
  Edit2,
  Zap,
  Building2,
  CheckCircle,
  Copy,
  ExternalLink
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle,
} from './ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { useAuth } from '../hooks/useAuth';
import { toast } from 'sonner';

interface TeamsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// Types
interface TeamMember {
  id: number;
  name: string;
  email: string;
  role: 'owner' | 'admin' | 'member';
  avatar: string | null;
  joinedAt: string;
  creditsUsed: number;
}

const roleConfig = {
  owner: { label: 'Owner', icon: Crown, color: 'text-amber-400 bg-amber-400/10 border-amber-400/20' },
  admin: { label: 'Admin', icon: Shield, color: 'text-violet-400 bg-violet-400/10 border-violet-400/20' },
  member: { label: 'Member', icon: User, color: 'text-slate-400 bg-slate-400/10 border-slate-400/20' },
};

// Mock team data
const mockTeamMembers: TeamMember[] = [
  { id: 1, name: 'John Martinez', email: 'john@example.com', role: 'owner', avatar: null, joinedAt: '2024-01-15', creditsUsed: 150 },
  { id: 2, name: 'Sarah Chen', email: 'sarah@example.com', role: 'admin', avatar: null, joinedAt: '2024-02-20', creditsUsed: 87 },
  { id: 3, name: 'Mike Johnson', email: 'mike@example.com', role: 'member', avatar: null, joinedAt: '2024-03-10', creditsUsed: 42 },
];

const TeamMemberRow: React.FC<{ 
  member: TeamMember; 
  onRemove: (id: number) => void;
  onChangeRole: (id: number, role: string) => void;
  currentUserRole: string;
}> = ({ member, onRemove, onChangeRole, currentUserRole }) => {
  const config = roleConfig[member.role];
  const canManage = currentUserRole === 'owner' || (currentUserRole === 'admin' && member.role === 'member');

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="flex items-center justify-between p-3 rounded-lg bg-slate-800/40 border border-slate-700/50 hover:border-slate-600/50 transition-colors"
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white text-sm font-semibold flex-shrink-0">
          {member.name.charAt(0)}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-white truncate">{member.name}</p>
            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${config.color}`}>
              <config.icon className="w-2.5 h-2.5 mr-0.5" />
              {config.label}
            </Badge>
          </div>
          <p className="text-xs text-slate-500 truncate">{member.email}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <div className="text-right hidden sm:block">
          <p className="text-xs text-slate-300">{member.creditsUsed} credits</p>
        </div>
        
        {canManage && member.role !== 'owner' && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-white">
                <MoreVertical className="w-3.5 h-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-slate-800 border-slate-700">
              <DropdownMenuItem 
                className="text-slate-300 hover:text-white hover:bg-slate-700 text-xs"
                onClick={() => onChangeRole(member.id, member.role === 'admin' ? 'member' : 'admin')}
              >
                <Edit2 className="w-3 h-3 mr-2" />
                {member.role === 'admin' ? 'Demote to Member' : 'Promote to Admin'}
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-slate-700" />
              <DropdownMenuItem 
                className="text-red-400 hover:text-red-300 hover:bg-red-500/10 text-xs"
                onClick={() => onRemove(member.id)}
              >
                <Trash2 className="w-3 h-3 mr-2" />
                Remove
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </motion.div>
  );
};

export const TeamsModal: React.FC<TeamsModalProps> = ({ isOpen, onClose }) => {
  const { user } = useAuth();
  const [members, setMembers] = useState<TeamMember[]>(mockTeamMembers);
  const [inviteEmail, setInviteEmail] = useState('');
  const [isInviting, setIsInviting] = useState(false);
  const [showInviteForm, setShowInviteForm] = useState(false);

  const hasTeamAccess = user?.subscriptionTier === 'team' || user?.subscriptionTier === 'enterprise';
  const currentUserRole = user?.teamRole || 'member';
  const canInvite = currentUserRole === 'owner' || currentUserRole === 'admin';

  const totalCreditsUsed = members.reduce((sum, m) => sum + m.creditsUsed, 0);
  const pooledCredits = 500;
  const maxMembers = 5;

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    
    setIsInviting(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 1000));
      toast.success(`Invitation sent to ${inviteEmail}`);
      setInviteEmail('');
      setShowInviteForm(false);
    } catch (error) {
      toast.error('Failed to send invitation');
    } finally {
      setIsInviting(false);
    }
  };

  const handleRemoveMember = (id: number) => {
    setMembers(prev => prev.filter(m => m.id !== id));
    toast.success('Team member removed');
  };

  const handleChangeRole = (id: number, newRole: string) => {
    setMembers(prev => prev.map(m => 
      m.id === id ? { ...m, role: newRole as 'owner' | 'admin' | 'member' } : m
    ));
    toast.success('Role updated');
  };

  const copyInviteLink = () => {
    const inviteLink = `${window.location.origin}/join-team?code=TEAM123`;
    navigator.clipboard.writeText(inviteLink);
    toast.success('Invite link copied');
  };

  // Upgrade prompt for non-team users
  if (!hasTeamAccess) {
    return (
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-md bg-slate-900 border-slate-700">
          <div className="text-center py-4">
            <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-violet-500/10 flex items-center justify-center">
              <Users className="w-7 h-7 text-violet-400" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Team Features</h2>
            <p className="text-sm text-slate-400 mb-6">
              Upgrade to collaborate with your team and share AI credits.
            </p>
            <div className="space-y-2 mb-6 text-left">
              {[
                'Shared AI credits pool',
                'Team member management',
                'Usage analytics & insights'
              ].map((feature, i) => (
                <div key={i} className="flex items-center gap-2 p-2 bg-slate-800/50 rounded-lg">
                  <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  <span className="text-xs text-slate-300">{feature}</span>
                </div>
              ))}
            </div>
            <div className="space-y-2">
              <Button 
                className="w-full bg-violet-600 hover:bg-violet-700 text-sm"
                onClick={() => window.open('/pricing', '_blank')}
              >
                <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                View Team Plans
              </Button>
              <Button 
                variant="ghost" 
                className="w-full text-slate-400 hover:text-white text-sm"
                onClick={onClose}
              >
                Close
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto bg-slate-900 border-slate-700 p-0">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-slate-900/95 backdrop-blur-sm border-b border-slate-800 px-6 py-4">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="text-xl font-bold text-white">Team Management</DialogTitle>
                <p className="text-sm text-slate-400 mt-1">Manage members and resources</p>
              </div>
              {canInvite && (
                <Button 
                  size="sm"
                  className="bg-violet-600 hover:bg-violet-700 text-xs"
                  onClick={() => setShowInviteForm(true)}
                >
                  <UserPlus className="w-3.5 h-3.5 mr-1.5" />
                  Invite
                </Button>
              )}
            </div>
          </DialogHeader>
        </div>

        <div className="p-6 space-y-5">
          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
              <div className="flex items-center gap-2 mb-1">
                <Users className="w-4 h-4 text-violet-400" />
                <span className="text-[10px] text-slate-400 uppercase tracking-wide">Members</span>
              </div>
              <p className="text-lg font-bold text-white">{members.length}/{maxMembers}</p>
            </div>
            <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
              <div className="flex items-center gap-2 mb-1">
                <Zap className="w-4 h-4 text-amber-400" />
                <span className="text-[10px] text-slate-400 uppercase tracking-wide">Credits</span>
              </div>
              <p className="text-lg font-bold text-white">{pooledCredits - totalCreditsUsed}</p>
            </div>
            <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
              <div className="flex items-center gap-2 mb-1">
                <Building2 className="w-4 h-4 text-emerald-400" />
                <span className="text-[10px] text-slate-400 uppercase tracking-wide">Plan</span>
              </div>
              <p className="text-lg font-bold text-white capitalize">{user?.subscriptionTier || 'Team'}</p>
            </div>
          </div>

          {/* Invite Form */}
          <AnimatePresence>
            {showInviteForm && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <Card className="bg-slate-800/50 border-slate-700">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm text-white">Invite Team Member</CardTitle>
                    <CardDescription className="text-xs text-slate-400">
                      Send an invitation via email
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Input
                      type="email"
                      placeholder="colleague@company.com"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      className="bg-slate-900 border-slate-700 text-white text-sm h-9"
                    />
                    <div className="flex items-center gap-2 p-2 bg-slate-700/30 rounded-md">
                      <Copy className="w-3.5 h-3.5 text-slate-400" />
                      <span className="text-xs text-slate-400 flex-1">Or share invite link</span>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={copyInviteLink}
                        className="text-violet-400 hover:text-violet-300 h-7 text-xs"
                      >
                        Copy
                      </Button>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => setShowInviteForm(false)}
                        className="text-slate-400 text-xs h-8"
                      >
                        Cancel
                      </Button>
                      <Button 
                        size="sm"
                        onClick={handleInvite}
                        disabled={isInviting || !inviteEmail.trim()}
                        className="bg-violet-600 hover:bg-violet-700 text-xs h-8"
                      >
                        {isInviting ? 'Sending...' : 'Send'}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Team Members */}
          <div>
            <h3 className="text-sm font-medium text-slate-300 mb-3">Team Members</h3>
            <div className="space-y-2">
              <AnimatePresence>
                {members.map((member) => (
                  <TeamMemberRow
                    key={member.id}
                    member={member}
                    onRemove={handleRemoveMember}
                    onChangeRole={handleChangeRole}
                    currentUserRole={currentUserRole}
                  />
                ))}
              </AnimatePresence>
            </div>

            {members.length < maxMembers && canInvite && !showInviteForm && (
              <Button
                variant="outline"
                size="sm"
                className="w-full mt-3 border-dashed border-slate-700 text-slate-400 hover:text-white hover:border-violet-500 text-xs"
                onClick={() => setShowInviteForm(true)}
              >
                <UserPlus className="w-3.5 h-3.5 mr-1.5" />
                Add Member ({maxMembers - members.length} slots)
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TeamsModal;

