// client/src/components/views/DashboardView.tsx
// Dashboard view with analytics, credits overview, and quick actions

import React from 'react';
import { motion } from 'framer-motion';
import { 
  MessageSquare, 
  Zap, 
  TrendingUp, 
  Clock, 
  Bot,
  FileText,
  CreditCard,
  ChevronRight,
  BarChart3,
  ArrowUpRight,
  Plus
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Progress } from '../ui/progress';
import { useAuth } from '../../hooks/useAuth';
import { Link, useNavigate } from 'react-router-dom';

interface StatCardProps {
  title: string;
  value: string | number;
  description: string;
  icon: React.ReactNode;
  trend?: { value: number; positive: boolean };
  className?: string;
}

const StatCard: React.FC<StatCardProps> = ({ 
  title, 
  value, 
  description, 
  icon, 
  trend,
  className = '' 
}) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.3 }}
  >
    <Card className={`bg-slate-800/50 border-slate-700 hover:border-violet-500/30 transition-colors ${className}`}>
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <p className="text-sm text-slate-400">{title}</p>
            <p className="text-2xl font-bold text-white">{value}</p>
            <p className="text-xs text-slate-500">{description}</p>
          </div>
          <div className="p-3 bg-violet-500/10 rounded-lg text-violet-400">
            {icon}
          </div>
        </div>
        {trend && (
          <div className={`mt-4 flex items-center text-xs ${trend.positive ? 'text-green-400' : 'text-red-400'}`}>
            <ArrowUpRight className={`w-3 h-3 mr-1 ${!trend.positive && 'rotate-180'}`} />
            <span>{trend.value}% from last month</span>
          </div>
        )}
      </CardContent>
    </Card>
  </motion.div>
);

interface QuickActionProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  to: string;
  color: string;
}

const QuickAction: React.FC<QuickActionProps> = ({ title, description, icon, to, color }) => {
  const navigate = useNavigate();
  
  return (
    <motion.button
      onClick={() => navigate(to)}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className={`w-full p-4 rounded-xl bg-gradient-to-br ${color} text-left transition-all hover:shadow-lg hover:shadow-violet-500/10`}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="font-semibold text-white">{title}</p>
          <p className="text-xs text-white/70">{description}</p>
        </div>
        <div className="p-2 bg-white/10 rounded-lg">
          {icon}
        </div>
      </div>
    </motion.button>
  );
};

export const DashboardView: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  
  // Calculate credits percentage
  const creditsBalance = user?.ai_credits_balance ?? 0;
  const messagesUsed = user?.messages_used_this_month ?? 0;
  const monthlyAllowance = 10; // Freemium default
  const creditsPercentage = Math.min((creditsBalance / 100) * 100, 100);
  const messagesPercentage = Math.min((messagesUsed / monthlyAllowance) * 100, 100);

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-xl">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white">Dashboard</h1>
              <p className="text-sm text-slate-400">
                Welcome back, {user?.firstName || user?.username || 'User'}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                className="border-slate-700 hover:bg-slate-800"
                onClick={() => navigate('/settings')}
              >
                Settings
              </Button>
              <Button
                className="bg-violet-600 hover:bg-violet-700"
                onClick={() => navigate('/chat')}
              >
                <Plus className="w-4 h-4 mr-2" />
                New Chat
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatCard
            title="AI Credits"
            value={creditsBalance}
            description="Available credits"
            icon={<Zap className="w-5 h-5" />}
            trend={{ value: 12, positive: true }}
          />
          <StatCard
            title="Messages This Month"
            value={messagesUsed}
            description={`of ${monthlyAllowance} monthly allowance`}
            icon={<MessageSquare className="w-5 h-5" />}
          />
          <StatCard
            title="Total Conversations"
            value="23"
            description="All time"
            icon={<Bot className="w-5 h-5" />}
            trend={{ value: 8, positive: true }}
          />
          <StatCard
            title="Files Analyzed"
            value="7"
            description="This week"
            icon={<FileText className="w-5 h-5" />}
          />
        </div>

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Quick Actions & Usage */}
          <div className="lg:col-span-2 space-y-6">
            {/* Quick Actions */}
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader>
                <CardTitle className="text-white">Quick Actions</CardTitle>
                <CardDescription className="text-slate-400">
                  Get started with common tasks
                </CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <QuickAction
                  title="New Chat"
                  description="Start a conversation with AI"
                  icon={<MessageSquare className="w-5 h-5 text-white" />}
                  to="/chat"
                  color="from-violet-600 to-purple-700"
                />
                <QuickAction
                  title="Upload Files"
                  description="Analyze documents with AI"
                  icon={<FileText className="w-5 h-5 text-white" />}
                  to="/chat"
                  color="from-blue-600 to-cyan-700"
                />
                <QuickAction
                  title="Buy Credits"
                  description="Top up your AI credits"
                  icon={<CreditCard className="w-5 h-5 text-white" />}
                  to="/pricing"
                  color="from-amber-600 to-orange-700"
                />
                <QuickAction
                  title="Team Settings"
                  description="Manage team members"
                  icon={<Bot className="w-5 h-5 text-white" />}
                  to="/teams"
                  color="from-emerald-600 to-teal-700"
                />
              </CardContent>
            </Card>

            {/* Recent Activity */}
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-white">Recent Activity</CardTitle>
                  <CardDescription className="text-slate-400">
                    Your latest conversations
                  </CardDescription>
                </div>
                <Button 
                  variant="ghost" 
                  className="text-violet-400 hover:text-violet-300"
                  onClick={() => navigate('/chat')}
                >
                  View All
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="flex items-center gap-4 p-3 rounded-lg hover:bg-slate-700/50 transition-colors cursor-pointer"
                      onClick={() => navigate('/chat')}
                    >
                      <div className="p-2 bg-violet-500/10 rounded-lg">
                        <MessageSquare className="w-4 h-4 text-violet-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">
                          Conversation #{i}
                        </p>
                        <p className="text-xs text-slate-400">
                          {i === 1 ? '2 hours ago' : i === 2 ? 'Yesterday' : '3 days ago'}
                        </p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-500" />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Usage & Subscription */}
          <div className="space-y-6">
            {/* Usage Overview */}
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader>
                <CardTitle className="text-white">Usage Overview</CardTitle>
                <CardDescription className="text-slate-400">
                  Your current plan usage
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Credits Usage */}
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">AI Credits</span>
                    <span className="text-white font-medium">{creditsBalance} available</span>
                  </div>
                  <Progress value={creditsPercentage} className="h-2 bg-slate-700" />
                </div>

                {/* Messages Usage */}
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Monthly Messages</span>
                    <span className="text-white font-medium">
                      {messagesUsed}/{monthlyAllowance}
                    </span>
                  </div>
                  <Progress 
                    value={messagesPercentage} 
                    className="h-2 bg-slate-700"
                  />
                </div>

                <div className="pt-4 border-t border-slate-700">
                  <Button 
                    className="w-full bg-violet-600 hover:bg-violet-700"
                    onClick={() => navigate('/pricing')}
                  >
                    Upgrade Plan
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Subscription Info */}
            <Card className="bg-gradient-to-br from-violet-600/20 to-purple-600/20 border-violet-500/30">
              <CardContent className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-violet-500/20 rounded-lg">
                    <Zap className="w-5 h-5 text-violet-400" />
                  </div>
                  <div>
                    <p className="font-semibold text-white">
                      {user?.subscriptionTier === 'pro' ? 'Pro' : 
                       user?.subscriptionTier === 'team' ? 'Team' : 'Freemium'} Plan
                    </p>
                    <p className="text-xs text-slate-400">
                      {user?.subscriptionStatus === 'active' ? 'Active subscription' : 'Free tier'}
                    </p>
                  </div>
                </div>
                <p className="text-sm text-slate-300 mb-4">
                  Get more credits and features with a paid plan.
                </p>
                <Button 
                  variant="outline" 
                  className="w-full border-violet-500/50 text-violet-300 hover:bg-violet-500/10"
                  onClick={() => navigate('/pricing')}
                >
                  View Plans
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
};

export default DashboardView;

