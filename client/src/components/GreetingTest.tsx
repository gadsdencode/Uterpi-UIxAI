import React, { useState } from 'react';
import { GreetingService, GreetingContext } from '../lib/greetingService';
import { useDynamicGreeting } from '../hooks/useDynamicGreeting';
import { User } from '../hooks/useAuth';

// Mock user data for testing
const mockUsers = [
  {
    id: 1,
    firstName: 'Alex',
    username: 'alex_dev',
    bio: 'Software Developer',
    age: 28,
    dateOfBirth: '1995-06-15'
  },
  {
    id: 2,
    firstName: 'Sarah',
    username: 'sarah_designer',
    bio: 'UI/UX Designer',
    age: 32,
    dateOfBirth: '1991-03-22'
  },
  {
    id: 3,
    firstName: 'Mike',
    username: 'mike_entrepreneur',
    bio: 'Entrepreneur',
    age: 45,
    dateOfBirth: '1978-11-08'
  }
];

export const GreetingTest: React.FC = () => {
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [testResults, setTestResults] = useState<string[]>([]);
  
  // Use the dynamic greeting hook
  const { greeting, isLoading, error, isAIGenerated, refreshGreeting } = useDynamicGreeting(selectedUser, {
    enableAI: false, // Start with template mode for testing
    fallbackToTemplate: true,
    includeSuggestions: true,
    maxLength: 150
  });

  const runGreetingTests = async () => {
    const results: string[] = [];
    const greetingService = GreetingService.getInstance();
    
    for (const user of mockUsers) {
      const context = greetingService.buildContext(user as User);
      const templateGreeting = greetingService.generateGreeting(context, {
        useAI: false,
        fallbackToTemplate: true,
        includeSuggestions: true,
        maxLength: 150
      });
      
      results.push(`👤 ${user.firstName} (${user.bio}): "${templateGreeting}"`);
    }
    
    setTestResults(results);
  };

  return (
    <div className="p-6 bg-slate-900 rounded-lg border border-slate-700">
      <h2 className="text-xl font-bold text-white mb-4">Dynamic Greeting System Test</h2>
      
      <div className="space-y-4">
        {/* User Selection */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Select User Profile:
          </label>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setSelectedUser(null)}
              className={`px-3 py-2 rounded text-sm ${
                !selectedUser 
                  ? 'bg-violet-600 text-white' 
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              No User (Guest)
            </button>
            {mockUsers.map((user) => (
              <button
                key={user.id}
                onClick={() => setSelectedUser(user)}
                className={`px-3 py-2 rounded text-sm ${
                  selectedUser?.id === user.id 
                    ? 'bg-violet-600 text-white' 
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                {user.firstName}
              </button>
            ))}
          </div>
        </div>

        {/* Current Greeting Display */}
        <div className="bg-slate-800 p-4 rounded-lg">
          <h3 className="text-lg font-semibold text-white mb-2">Current Greeting:</h3>
          {isLoading ? (
            <div className="flex items-center gap-2 text-slate-400">
              <div className="w-4 h-4 border-2 border-violet-500 border-t-transparent rounded-full animate-spin"></div>
              <span>Generating greeting...</span>
            </div>
          ) : error ? (
            <div className="text-red-400">Error: {error}</div>
          ) : (
            <div>
              <p className="text-slate-200 mb-2">"{greeting}"</p>
              <div className="flex items-center gap-2 text-xs text-slate-400">
                {isAIGenerated ? (
                  <>
                    <span className="w-2 h-2 bg-violet-500 rounded-full"></span>
                    <span>AI-Generated</span>
                  </>
                ) : (
                  <>
                    <span className="w-2 h-2 bg-slate-500 rounded-full"></span>
                    <span>Template-Based</span>
                  </>
                )}
              </div>
            </div>
          )}
          
          <button
            onClick={refreshGreeting}
            className="mt-3 px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded text-sm text-slate-300"
          >
            Refresh Greeting
          </button>
        </div>

        {/* Test All Users */}
        <div>
          <button
            onClick={runGreetingTests}
            className="px-4 py-2 bg-violet-600 hover:bg-violet-700 rounded text-white font-medium"
          >
            Test All User Profiles
          </button>
          
          {testResults.length > 0 && (
            <div className="mt-4 bg-slate-800 p-4 rounded-lg">
              <h3 className="text-lg font-semibold text-white mb-2">Test Results:</h3>
              <div className="space-y-2">
                {testResults.map((result, index) => (
                  <div key={index} className="text-slate-300 text-sm">
                    {result}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Features Showcase */}
        <div className="bg-slate-800 p-4 rounded-lg">
          <h3 className="text-lg font-semibold text-white mb-2">New Features:</h3>
          <ul className="space-y-1 text-sm text-slate-300">
            <li>✅ Time-aware greetings (morning, afternoon, evening)</li>
            <li>✅ Personalized based on user profile data</li>
            <li>✅ Context-aware (first visit vs returning user)</li>
            <li>✅ AI-generated greetings with fallback to templates</li>
            <li>✅ Birthday detection and special messages</li>
            <li>✅ Device type awareness (mobile, desktop, tablet)</li>
            <li>✅ Conversation history integration</li>
            <li>✅ Loading states and error handling</li>
          </ul>
        </div>
      </div>
    </div>
  );
};
