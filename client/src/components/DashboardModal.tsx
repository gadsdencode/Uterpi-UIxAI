// DashboardModal.tsx - Dashboard as a modal popup
// Shows analytics, credits overview, and quick actions

import React from 'react';
import { motion } from 'framer-motion';
import { 
  MessageSquare, 
  Zap, 
  Bot,
  FileText,
  CreditCard,
  ChevronRight,
  ArrowUpRight,
  X,
  ExternalLink
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Progress } from './ui/progress';
import { useAuth } from '../hooks/useAuth';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';

interface DashboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateToChat?: () => void;
  onOpenTeams?: () => void;
}

interface StatCardProps {
  title: string;
  value: string | number;
  description: string;
  icon: React.ReactNode;
  trend?: { value: number; positive: boolean };
}

const StatCard: React.FC<StatCardProps> = ({ title, value, description, icon, trend }) => (
  <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/50">
    <div className="flex items-start justify-between">
      <div className="space-y-1">
        <p className="text-xs text-slate-400">{title}</p>
        <p className="text-xl font-bold text-white">{value}</p>
        <p className="text-[10px] text-slate-500">{description}</p>
      </div>
      <div className="p-2 bg-violet-500/10 rounded-lg text-violet-400">
        {icon}
      </div>
    </div>
    {trend && (
      <div className={`mt-2 flex items-center text-[10px] ${trend.positive ? 'text-emerald-400' : 'text-red-400'}`}>
        <ArrowUpRight className={`w-3 h-3 mr-0.5 ${!trend.positive && 'rotate-180'}`} />
        <span>{trend.value}% from last month</span>
      </div>
    )}
  </div>
);

interface QuickActionProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  onClick: () => void;
  color: string;
}

const QuickAction: React.FC<QuickActionProps> = ({ title, description, icon, onClick, color }) => (
  <motion.button
    onClick={onClick}
    whileHover={{ scale: 1.02 }}
    whileTap={{ scale: 0.98 }}
    className={`w-full p-3 rounded-lg bg-gradient-to-br ${color} text-left transition-all`}
  >
    <div className="flex items-center gap-3">
      <div className="p-1.5 bg-white/10 rounded-md">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white">{title}</p>
        <p className="text-[10px] text-white/70 truncate">{description}</p>
      </div>
      <ChevronRight className="w-4 h-4 text-white/50" />
    </div>
  </motion.button>
);

export const DashboardModal: React.FC<DashboardModalProps> = ({ 
  isOpen, 
  onClose,
  onNavigateToChat,
  onOpenTeams
}) => {
  const { user } = useAuth();
  
  const creditsBalance = user?.ai_credits_balance ?? 0;
  const messagesUsed = user?.messages_used_this_month ?? 0;
  const monthlyAllowance = 10;
  const creditsPercentage = Math.min((creditsBalance / 500) * 100, 100);
  const messagesPercentage = Math.min((messagesUsed / monthlyAllowance) * 100, 100);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto bg-slate-900 border-slate-700 p-0">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-slate-900/95 backdrop-blur-sm border-b border-slate-800 px-6 py-4">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="text-xl font-bold text-white">Dashboard</DialogTitle>
                <p className="text-sm text-slate-400 mt-1">
                  Welcome back, {user?.firstName || user?.username || 'User'}
                </p>
              </div>
            </div>
          </DialogHeader>
        </div>

        <div className="p-6 space-y-6">
          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              title="AI Credits"
              value={creditsBalance.toLocaleString()}
              description="Available"
              icon={<Zap className="w-4 h-4" />}
              trend={{ value: 12, positive: true }}
            />
            <StatCard
              title="Messages"
              value={messagesUsed}
              description={`of ${monthlyAllowance} monthly`}
              icon={<MessageSquare className="w-4 h-4" />}
            />
            <StatCard
              title="Conversations"
              value="23"
              description="All time"
              icon={<Bot className="w-4 h-4" />}
              trend={{ value: 8, positive: true }}
            />
            <StatCard
              title="Files"
              value="7"
              description="Analyzed this week"
              icon={<FileText className="w-4 h-4" />}
            />
          </div>

          {/* Quick Actions */}
          <div>
            <h3 className="text-sm font-medium text-slate-300 mb-3">Quick Actions</h3>
            <div className="grid grid-cols-2 gap-2">
              <QuickAction
                title="New Chat"
                description="Start AI conversation"
                icon={<MessageSquare className="w-4 h-4 text-white" />}
                onClick={() => { onClose(); onNavigateToChat?.(); }}
                color="from-violet-600 to-purple-700"
              />
              <QuickAction
                title="Upload Files"
                description="Analyze documents"
                icon={<FileText className="w-4 h-4 text-white" />}
                onClick={() => { onClose(); onNavigateToChat?.(); }}
                color="from-blue-600 to-cyan-700"
              />
              <QuickAction
                title="Buy Credits"
                description="Top up AI credits"
                icon={<CreditCard className="w-4 h-4 text-white" />}
                onClick={() => window.open('/pricing', '_blank')}
                color="from-amber-600 to-orange-700"
              />
              <QuickAction
                title="Team Settings"
                description="Manage members"
                icon={<Bot className="w-4 h-4 text-white" />}
                onClick={() => { onClose(); onOpenTeams?.(); }}
                color="from-emerald-600 to-teal-700"
              />
            </div>
          </div>

          {/* Usage Overview */}
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-white">Usage Overview</CardTitle>
              <CardDescription className="text-xs text-slate-400">Current plan usage</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">AI Credits</span>
                  <span className="text-white font-medium">{creditsBalance} available</span>
                </div>
                <Progress value={creditsPercentage} className="h-1.5 bg-slate-700" />
              </div>
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">Monthly Messages</span>
                  <span className="text-white font-medium">{messagesUsed}/{monthlyAllowance}</span>
                </div>
                <Progress value={messagesPercentage} className="h-1.5 bg-slate-700" />
              </div>
            </CardContent>
          </Card>

          {/* Subscription Card */}
          <div className="p-4 rounded-xl bg-gradient-to-br from-violet-600/20 to-purple-600/20 border border-violet-500/30">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-violet-500/20 rounded-lg">
                <Zap className="w-4 h-4 text-violet-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">
                  {user?.subscriptionTier === 'pro' ? 'Pro' : 
                   user?.subscriptionTier === 'team' ? 'Team' : 'Freemium'} Plan
                </p>
                <p className="text-[10px] text-slate-400">
                  {user?.subscriptionStatus === 'active' ? 'Active' : 'Free tier'}
                </p>
              </div>
            </div>
            <p className="text-xs text-slate-300 mb-3">
              Get more credits and features with a paid plan.
            </p>
            <Button 
              variant="outline" 
              size="sm"
              className="w-full border-violet-500/50 text-violet-300 hover:bg-violet-500/10 text-xs"
              onClick={() => window.open('/pricing', '_blank')}
            >
              <ExternalLink className="w-3 h-3 mr-1.5" />
              View Plans
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DashboardModal;

