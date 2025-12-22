// client/src/components/views/TeamsView.tsx
// Team management view for Team and Enterprise plans

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Users, 
  UserPlus, 
  Settings, 
  Crown,
  Shield,
  User,
  MoreVertical,
  Mail,
  Trash2,
  Edit2,
  Zap,
  Building2,
  ChevronRight,
  AlertCircle,
  CheckCircle,
  Copy
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { Progress } from '../ui/progress';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle,
  DialogTrigger 
} from '../ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { useAuth } from '../../hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

// Mock team data - in production this would come from the API
const mockTeamMembers = [
  { 
    id: 1, 
    name: 'John Martinez', 
    email: 'john@example.com', 
    role: 'owner', 
    avatar: null,
    joinedAt: '2024-01-15',
    creditsUsed: 150
  },
  { 
    id: 2, 
    name: 'Sarah Chen', 
    email: 'sarah@example.com', 
    role: 'admin', 
    avatar: null,
    joinedAt: '2024-02-20',
    creditsUsed: 87
  },
  { 
    id: 3, 
    name: 'Mike Johnson', 
    email: 'mike@example.com', 
    role: 'member', 
    avatar: null,
    joinedAt: '2024-03-10',
    creditsUsed: 42
  },
];

const roleConfig = {
  owner: { label: 'Owner', icon: Crown, color: 'text-amber-400 bg-amber-400/10' },
  admin: { label: 'Admin', icon: Shield, color: 'text-violet-400 bg-violet-400/10' },
  member: { label: 'Member', icon: User, color: 'text-slate-400 bg-slate-400/10' },
};

interface TeamMember {
  id: number;
  name: string;
  email: string;
  role: 'owner' | 'admin' | 'member';
  avatar: string | null;
  joinedAt: string;
  creditsUsed: number;
}

const TeamMemberCard: React.FC<{ 
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
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="flex items-center justify-between p-4 rounded-lg bg-slate-800/50 border border-slate-700 hover:border-violet-500/30 transition-colors"
    >
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white font-semibold">
          {member.name.charAt(0)}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <p className="font-medium text-white">{member.name}</p>
            <Badge variant="outline" className={config.color}>
              <config.icon className="w-3 h-3 mr-1" />
              {config.label}
            </Badge>
          </div>
          <p className="text-sm text-slate-400">{member.email}</p>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="text-right hidden sm:block">
          <p className="text-sm text-white">{member.creditsUsed} credits used</p>
          <p className="text-xs text-slate-500">Joined {new Date(member.joinedAt).toLocaleDateString()}</p>
        </div>
        
        {canManage && member.role !== 'owner' && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-white">
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-slate-800 border-slate-700">
              <DropdownMenuItem 
                className="text-slate-300 hover:text-white hover:bg-slate-700"
                onClick={() => onChangeRole(member.id, member.role === 'admin' ? 'member' : 'admin')}
              >
                <Edit2 className="w-4 h-4 mr-2" />
                {member.role === 'admin' ? 'Demote to Member' : 'Promote to Admin'}
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-slate-700" />
              <DropdownMenuItem 
                className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                onClick={() => onRemove(member.id)}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Remove from Team
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </motion.div>
  );
};

export const TeamsView: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [members, setMembers] = useState<TeamMember[]>(mockTeamMembers);
  const [inviteEmail, setInviteEmail] = useState('');
  const [isInviting, setIsInviting] = useState(false);
  const [showInviteDialog, setShowInviteDialog] = useState(false);

  // Check if user has team access
  const hasTeamAccess = user?.subscriptionTier === 'team' || user?.subscriptionTier === 'enterprise';
  const currentUserRole = user?.teamRole || 'member';
  const canInvite = currentUserRole === 'owner' || currentUserRole === 'admin';

  // Team stats
  const totalCreditsUsed = members.reduce((sum, m) => sum + m.creditsUsed, 0);
  const pooledCredits = 500; // Would come from API
  const maxMembers = 5;

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    
    setIsInviting(true);
    try {
      // In production, this would be an API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      toast.success(`Invitation sent to ${inviteEmail}`);
      setInviteEmail('');
      setShowInviteDialog(false);
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
    toast.success('Role updated successfully');
  };

  const copyInviteLink = () => {
    const inviteLink = `${window.location.origin}/join-team?code=TEAM123`;
    navigator.clipboard.writeText(inviteLink);
    toast.success('Invite link copied to clipboard');
  };

  // Show upgrade prompt if not on team plan
  if (!hasTeamAccess) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full"
        >
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-8 text-center">
              <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-violet-500/10 flex items-center justify-center">
                <Users className="w-8 h-8 text-violet-400" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">Team Features</h2>
              <p className="text-slate-400 mb-6">
                Upgrade to a Team or Enterprise plan to collaborate with your team and share AI credits.
              </p>
              <div className="space-y-4">
                <div className="flex items-center gap-3 text-left p-3 bg-slate-700/50 rounded-lg">
                  <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0" />
                  <span className="text-sm text-slate-300">Shared AI credits pool</span>
                </div>
                <div className="flex items-center gap-3 text-left p-3 bg-slate-700/50 rounded-lg">
                  <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0" />
                  <span className="text-sm text-slate-300">Team member management</span>
                </div>
                <div className="flex items-center gap-3 text-left p-3 bg-slate-700/50 rounded-lg">
                  <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0" />
                  <span className="text-sm text-slate-300">Usage analytics & insights</span>
                </div>
              </div>
              <div className="mt-8 space-y-3">
                <Button 
                  className="w-full bg-violet-600 hover:bg-violet-700"
                  onClick={() => navigate('/pricing')}
                >
                  View Team Plans
                </Button>
                <Button 
                  variant="ghost" 
                  className="w-full text-slate-400 hover:text-white"
                  onClick={() => navigate('/dashboard')}
                >
                  Back to Dashboard
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-xl">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white">Team Management</h1>
              <p className="text-sm text-slate-400">
                Manage your team members and shared resources
              </p>
            </div>
            <div className="flex items-center gap-3">
              {canInvite && (
                <Dialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
                  <DialogTrigger asChild>
                    <Button className="bg-violet-600 hover:bg-violet-700">
                      <UserPlus className="w-4 h-4 mr-2" />
                      Invite Member
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="bg-slate-800 border-slate-700">
                    <DialogHeader>
                      <DialogTitle className="text-white">Invite Team Member</DialogTitle>
                      <DialogDescription className="text-slate-400">
                        Send an invitation to join your team.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <label className="text-sm text-slate-300">Email Address</label>
                        <Input
                          type="email"
                          placeholder="colleague@company.com"
                          value={inviteEmail}
                          onChange={(e) => setInviteEmail(e.target.value)}
                          className="bg-slate-900 border-slate-700 text-white"
                        />
                      </div>
                      <div className="flex items-center gap-2 p-3 bg-slate-700/50 rounded-lg">
                        <Copy className="w-4 h-4 text-slate-400" />
                        <span className="text-sm text-slate-300 flex-1">Or share invite link</span>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={copyInviteLink}
                          className="text-violet-400 hover:text-violet-300"
                        >
                          Copy Link
                        </Button>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button 
                        variant="ghost" 
                        onClick={() => setShowInviteDialog(false)}
                        className="text-slate-400"
                      >
                        Cancel
                      </Button>
                      <Button 
                        onClick={handleInvite}
                        disabled={isInviting || !inviteEmail.trim()}
                        className="bg-violet-600 hover:bg-violet-700"
                      >
                        {isInviting ? 'Sending...' : 'Send Invitation'}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-violet-500/10 rounded-lg">
                  <Users className="w-5 h-5 text-violet-400" />
                </div>
                <div>
                  <p className="text-sm text-slate-400">Team Members</p>
                  <p className="text-2xl font-bold text-white">{members.length}/{maxMembers}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-amber-500/10 rounded-lg">
                  <Zap className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <p className="text-sm text-slate-400">Pooled Credits</p>
                  <p className="text-2xl font-bold text-white">{pooledCredits - totalCreditsUsed}</p>
                  <p className="text-xs text-slate-500">{totalCreditsUsed} used this month</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-emerald-500/10 rounded-lg">
                  <Building2 className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <p className="text-sm text-slate-400">Plan</p>
                  <p className="text-2xl font-bold text-white capitalize">
                    {user?.subscriptionTier || 'Team'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Team Members */}
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white">Team Members</CardTitle>
            <CardDescription className="text-slate-400">
              Manage your team and their access levels
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <AnimatePresence>
                {members.map((member) => (
                  <TeamMemberCard
                    key={member.id}
                    member={member}
                    onRemove={handleRemoveMember}
                    onChangeRole={handleChangeRole}
                    currentUserRole={currentUserRole}
                  />
                ))}
              </AnimatePresence>
            </div>

            {members.length < maxMembers && canInvite && (
              <Button
                variant="dashed"
                className="w-full mt-4 border-slate-700 text-slate-400 hover:text-white hover:border-violet-500"
                onClick={() => setShowInviteDialog(true)}
              >
                <UserPlus className="w-4 h-4 mr-2" />
                Add Team Member ({maxMembers - members.length} slots remaining)
              </Button>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default TeamsView;

