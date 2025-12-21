/**
 * Error Scenario Test Component
 * Tests various error scenarios and fallback behaviors
 */

import React, { useState } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Alert, AlertDescription } from './ui/alert';
import { LMStudioService } from '../lib/lmstudio';
import { GeminiService } from '../lib/gemini';
import { OpenAIService } from '../lib/openAI';
import { handleError, createError } from '../lib/error-handler';
import { toast } from 'sonner';

interface TestResult {
  scenario: string;
  status: 'pending' | 'running' | 'success' | 'error';
  result?: string;
  error?: string;
}

export const ErrorScenarioTest: React.FC = () => {
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  const testScenarios = [
    {
      name: 'Network Connection Refused',
      description: 'Test handling of ECONNREFUSED errors',
      test: async () => {
        // Simulate connection refused by using invalid URL
        const service = new LMStudioService({
          apiKey: 'test',
          baseUrl: 'http://localhost:9999', // Invalid port
          modelName: 'test'
        });
        
        try {
          await service.sendChatCompletion([
            { role: 'user', content: 'test' }
          ]);
          throw new Error('Expected connection error');
        } catch (error) {
          if (error instanceof Error && error.message.includes('fetch failed')) {
            return 'Successfully detected network error';
          }
          throw error;
        }
      }
    },
    {
      name: 'Invalid API Key',
      description: 'Test handling of authentication errors',
      test: async () => {
        const service = new GeminiService({
          apiKey: 'invalid-key',
          modelName: 'gemini-2.5-flash'
        });
        
        try {
          await service.sendChatCompletion([
            { role: 'user', content: 'test' }
          ]);
          throw new Error('Expected auth error');
        } catch (error) {
          if (error instanceof Error && error.message.includes('API key')) {
            return 'Successfully detected authentication error';
          }
          throw error;
        }
      }
    },
    {
      name: 'Request Timeout',
      description: 'Test handling of timeout errors',
      test: async () => {
        // Create a service with very short timeout
        const service = new OpenAIService({
          apiKey: 'sk-test',
          modelName: 'gpt-4o-mini'
        });
        
        try {
          // This should timeout due to invalid key and network issues
          await Promise.race([
            service.sendChatCompletion([
              { role: 'user', content: 'test' }
            ]),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Request timeout')), 2000)
            )
          ]);
          throw new Error('Expected timeout error');
        } catch (error) {
          if (error instanceof Error && (
            error.message.includes('timeout') || 
            error.message.includes('fetch failed')
          )) {
            return 'Successfully detected timeout error';
          }
          throw error;
        }
      }
    },
    {
      name: 'Server Error (502)',
      description: 'Test handling of server errors',
      test: async () => {
        // Simulate server error by making request to non-existent endpoint
        try {
          const response = await fetch('/api/nonexistent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ test: true })
          });
          
          if (response.status >= 500) {
            return 'Successfully detected server error';
          }
          throw new Error('Expected server error');
        } catch (error) {
          if (error instanceof Error && error.message.includes('404')) {
            return 'Successfully detected not found error';
          }
          throw error;
        }
      }
    },
    {
      name: 'Error Handler Integration',
      description: 'Test error handler integration',
      test: async () => {
        try {
          // Simulate an error and test error handler
          const testError = new Error('Test error for handler');
          handleError(testError, {
            operation: 'test_operation',
            component: 'ErrorScenarioTest',
            timestamp: new Date()
          });
          return 'Error handler executed successfully';
        } catch (error) {
          throw error;
        }
      }
    }
  ];

  const runTest = async (scenario: typeof testScenarios[0]) => {
    const testResult: TestResult = {
      scenario: scenario.name,
      status: 'running'
    };

    setTestResults(prev => [...prev, testResult]);

    try {
      const result = await scenario.test();
      setTestResults(prev => 
        prev.map(r => 
          r.scenario === scenario.name 
            ? { ...r, status: 'success', result }
            : r
        )
      );
    } catch (error) {
      setTestResults(prev => 
        prev.map(r => 
          r.scenario === scenario.name 
            ? { 
                ...r, 
                status: 'error', 
                error: error instanceof Error ? error.message : 'Unknown error'
              }
            : r
        )
      );
    }
  };

  const runAllTests = async () => {
    setIsRunning(true);
    setTestResults([]);

    for (const scenario of testScenarios) {
      await runTest(scenario);
      // Small delay between tests
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    setIsRunning(false);
  };

  const getStatusBadge = (status: TestResult['status']) => {
    switch (status) {
      case 'pending':
        return <Badge variant="secondary">Pending</Badge>;
      case 'running':
        return <Badge variant="default">Running</Badge>;
      case 'success':
        return <Badge variant="default" className="bg-green-600">Success</Badge>;
      case 'error':
        return <Badge variant="destructive">Error</Badge>;
    }
  };

  return (
    <div className="space-y-6 p-6">
      <Card>
        <CardHeader>
          <CardTitle>Error Scenario Testing</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Button
              onClick={runAllTests}
              disabled={isRunning}
              variant="default"
            >
              {isRunning ? 'Running Tests...' : 'Run All Tests'}
            </Button>
          </div>

          <Alert>
            <AlertDescription>
              This component tests various error scenarios to ensure proper error handling
              and user feedback. Tests include network errors, authentication failures,
              timeouts, and server errors.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Test Results</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {testScenarios.map((scenario, index) => {
              const result = testResults.find(r => r.scenario === scenario.name);
              
              return (
                <div key={index} className="p-4 border rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-medium">{scenario.name}</h3>
                    {result ? getStatusBadge(result.status) : <Badge variant="secondary">Pending</Badge>}
                  </div>
                  
                  <p className="text-sm text-muted-foreground mb-3">
                    {scenario.description}
                  </p>
                  
                  {result && (
                    <div className="space-y-2">
                      {result.result && (
                        <div className="text-sm text-green-600 bg-green-50 p-2 rounded">
                          {result.result}
                        </div>
                      )}
                      {result.error && (
                        <div className="text-sm text-red-600 bg-red-50 p-2 rounded">
                          Error: {result.error}
                        </div>
                      )}
                    </div>
                  )}
                  
                  <div className="mt-3">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => runTest(scenario)}
                      disabled={isRunning}
                    >
                      Run Test
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
