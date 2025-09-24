import { conversationService } from './conversation-service';
import { vectorService } from './vector-service';
import { vectorProcessor } from './vector-processor';
import { contextEnhancer } from './context-enhancer';

/**
 * Comprehensive test suite for the chat vectorization system
 * Tests all components with different AI providers
 */

interface TestResult {
  component: string;
  test: string;
  success: boolean;
  error?: string;
  data?: any;
}

class VectorizationTester {
  private results: TestResult[] = [];
  private testUserId = 1; // Use test user ID

  /**
   * Run all vectorization tests
   */
  async runAllTests(): Promise<TestResult[]> {
    console.log('🧪 Starting comprehensive vectorization system tests...\n');

    // Test each component
    await this.testConversationService();
    await this.testVectorService();
    await this.testVectorProcessor();
    await this.testContextEnhancer();
    await this.testProviderCompatibility();

    // Print summary
    this.printTestSummary();
    
    return this.results;
  }

  /**
   * Test conversation service functionality
   */
  private async testConversationService(): Promise<void> {
    console.log('📝 Testing Conversation Service...');

    try {
      // Test conversation creation
      const conversation = await conversationService.createConversation({
        userId: this.testUserId,
        provider: 'uterpi',
        model: 'nomadic-icdu-v8',
        title: 'Test Conversation'
      });

      this.addResult('ConversationService', 'Create Conversation', true, undefined, {
        conversationId: conversation.id,
        provider: conversation.provider,
        model: conversation.model
      });

      // Test message addition
      const userMessage = await conversationService.addMessage({
        conversationId: conversation.id,
        content: 'Hello, this is a test message about machine learning and AI.',
        role: 'user'
      });

      this.addResult('ConversationService', 'Add User Message', true, undefined, {
        messageId: userMessage.id,
        messageIndex: userMessage.messageIndex
      });

      const aiMessage = await conversationService.addMessage({
        conversationId: conversation.id,
        content: 'Hello! I can help you with machine learning and AI topics. What specific area would you like to explore?',
        role: 'assistant',
        metadata: {
          model: 'nomadic-icdu-v8',
          provider: 'uterpi',
          tokensUsed: 45
        }
      });

      this.addResult('ConversationService', 'Add AI Message', true, undefined, {
        messageId: aiMessage.id,
        messageIndex: aiMessage.messageIndex
      });

      // Test conversation retrieval
      const messages = await conversationService.getConversationMessages(conversation.id);
      this.addResult('ConversationService', 'Get Messages', messages.length === 2, 
        messages.length !== 2 ? `Expected 2 messages, got ${messages.length}` : undefined,
        { messageCount: messages.length }
      );

      // Test title generation
      const title = await conversationService.generateConversationTitle(conversation.id);
      this.addResult('ConversationService', 'Generate Title', title.length > 0, 
        title.length === 0 ? 'Title generation failed' : undefined,
        { title }
      );

    } catch (error) {
      this.addResult('ConversationService', 'Overall Test', false, error?.toString());
    }
  }

  /**
   * Test vector service functionality
   */
  private async testVectorService(): Promise<void> {
    console.log('🔤 Testing Vector Service...');

    try {
      // Test embedding generation with LM Studio
      const testText = 'This is a test about artificial intelligence and machine learning algorithms.';
      
      try {
        const embeddingResult = await vectorService.generateEmbedding(testText, 'lmstudio');
        this.addResult('VectorService', 'Generate LM Studio Embedding', true, undefined, {
          model: embeddingResult.model,
          dimensions: embeddingResult.dimensions,
          embeddingLength: embeddingResult.embedding.length
        });
      } catch (error) {
        this.addResult('VectorService', 'Generate LM Studio Embedding', false, `LM Studio embedding failed: ${error}`);
        
        // Try OpenAI fallback
        try {
          const fallbackResult = await vectorService.generateEmbedding(testText, 'openai');
          this.addResult('VectorService', 'Generate OpenAI Embedding (Fallback)', true, undefined, {
            model: fallbackResult.model,
            dimensions: fallbackResult.dimensions,
            embeddingLength: fallbackResult.embedding.length
          });
        } catch (fallbackError) {
          this.addResult('VectorService', 'Generate OpenAI Embedding (Fallback)', false, `OpenAI embedding also failed: ${fallbackError}`);
        }
      }

      // Test conversation summary generation
      const conversation = await conversationService.createConversation({
        userId: this.testUserId,
        provider: 'test',
        model: 'test-model'
      });

      await conversationService.addMessage({
        conversationId: conversation.id,
        content: 'What is machine learning?',
        role: 'user'
      });

      await conversationService.addMessage({
        conversationId: conversation.id,
        content: 'Machine learning is a subset of artificial intelligence that focuses on algorithms that can learn from data.',
        role: 'assistant'
      });

      const summary = await vectorService.generateConversationSummary(conversation.id);
      this.addResult('VectorService', 'Generate Conversation Summary', summary.length > 0,
        summary.length === 0 ? 'Summary generation failed' : undefined,
        { summaryLength: summary.length, summary: summary.substring(0, 100) + '...' }
      );

    } catch (error) {
      this.addResult('VectorService', 'Overall Test', false, error?.toString());
    }
  }

  /**
   * Test vector processor functionality
   */
  private async testVectorProcessor(): Promise<void> {
    console.log('⚙️ Testing Vector Processor...');

    try {
      // Get processor status
      const status = vectorProcessor.getQueueStatus();
      this.addResult('VectorProcessor', 'Get Queue Status', true, undefined, {
        messageQueue: status.messageQueue,
        conversationQueue: status.conversationQueue,
        isProcessing: status.isProcessing
      });

      // Test queueing (without actual processing to avoid external dependencies)
      const conversation = await conversationService.createConversation({
        userId: this.testUserId,
        provider: 'test',
        model: 'test-model'
      });

      const message = await conversationService.addMessage({
        conversationId: conversation.id,
        content: 'Test message for vectorization queue',
        role: 'user'
      });

      // Queue message for vectorization
      await vectorProcessor.queueMessageVectorization(message.id, conversation.id, 'high');
      
      const newStatus = vectorProcessor.getQueueStatus();
      this.addResult('VectorProcessor', 'Queue Message', newStatus.messageQueue > status.messageQueue,
        newStatus.messageQueue <= status.messageQueue ? 'Message was not queued' : undefined,
        { queueSize: newStatus.messageQueue }
      );

      // Clear queue for clean test environment
      vectorProcessor.clearQueues();
      
      const clearedStatus = vectorProcessor.getQueueStatus();
      this.addResult('VectorProcessor', 'Clear Queues', clearedStatus.totalPending === 0,
        clearedStatus.totalPending > 0 ? 'Queues were not cleared' : undefined,
        { totalPending: clearedStatus.totalPending }
      );

    } catch (error) {
      this.addResult('VectorProcessor', 'Overall Test', false, error?.toString());
    }
  }

  /**
   * Test context enhancer functionality
   */
  private async testContextEnhancer(): Promise<void> {
    console.log('🧠 Testing Context Enhancer...');

    try {
      // Test basic context enhancement (without actual similar messages)
      const testMessages = [
        { role: 'user' as const, content: 'Tell me about neural networks' },
        { role: 'assistant' as const, content: 'Neural networks are computational models inspired by biological neural networks.' },
        { role: 'user' as const, content: 'How do they learn?' }
      ];

      const contextOptions = {
        maxSimilarMessages: 2,
        maxSimilarConversations: 1,
        similarityThreshold: 0.8,
        includeConversationContext: true,
        includeMessageContext: true,
        maxContextLength: 1000
      };

      const enhancedContext = await contextEnhancer.enhanceMessagesWithContext(
        testMessages,
        this.testUserId,
        contextOptions
      );

      this.addResult('ContextEnhancer', 'Enhance Messages', enhancedContext.enhancedMessages.length > 0,
        enhancedContext.enhancedMessages.length === 0 ? 'No enhanced messages generated' : undefined,
        {
          originalMessageCount: testMessages.length,
          enhancedMessageCount: enhancedContext.enhancedMessages.length,
          similarMessagesFound: enhancedContext.similarMessages.length,
          similarConversationsFound: enhancedContext.similarConversations.length,
          contextLength: enhancedContext.contextualSystemMessage.length
        }
      );

      // Test context quality analysis
      const qualityAnalysis = await contextEnhancer.analyzeContextQuality(enhancedContext);
      this.addResult('ContextEnhancer', 'Analyze Context Quality', true, undefined, {
        hasRelevantContext: qualityAnalysis.hasRelevantContext,
        averageSimilarity: qualityAnalysis.averageSimilarity,
        contextLength: qualityAnalysis.contextLength
      });

    } catch (error) {
      this.addResult('ContextEnhancer', 'Overall Test', false, error?.toString());
    }
  }

  /**
   * Test compatibility with different AI providers
   */
  private async testProviderCompatibility(): Promise<void> {
    console.log('🤖 Testing AI Provider Compatibility...');

    const providers = [
      { name: 'uterpi', model: 'nomadic-icdu-v8' },
      { name: 'lmstudio', model: 'nomadic-icdu-v8' },
      { name: 'openai', model: 'gpt-4o-mini' },
      { name: 'gemini', model: 'gemini-2.5-flash' },
      { name: 'azure', model: 'ministral-3b' }
    ];

    for (const provider of providers) {
      try {
        // Test conversation creation for each provider
        const conversation = await conversationService.createConversation({
          userId: this.testUserId,
          provider: provider.name,
          model: provider.model,
          title: `Test ${provider.name} Conversation`
        });

        this.addResult('ProviderCompatibility', `Create ${provider.name} Conversation`, true, undefined, {
          provider: provider.name,
          model: provider.model,
          conversationId: conversation.id
        });

        // Test message storage
        const message = await conversationService.addMessage({
          conversationId: conversation.id,
          content: `Test message for ${provider.name} provider`,
          role: 'user'
        });

        this.addResult('ProviderCompatibility', `Store ${provider.name} Message`, true, undefined, {
          provider: provider.name,
          messageId: message.id
        });

      } catch (error) {
        this.addResult('ProviderCompatibility', `Test ${provider.name}`, false, error?.toString());
      }
    }
  }

  /**
   * Add test result
   */
  private addResult(component: string, test: string, success: boolean, error?: string, data?: any): void {
    this.results.push({ component, test, success, error, data });
    
    const status = success ? '✅' : '❌';
    const errorMsg = error ? ` - ${error}` : '';
    console.log(`  ${status} ${test}${errorMsg}`);
    
    if (data && success) {
      console.log(`    Data:`, JSON.stringify(data, null, 2));
    }
  }

  /**
   * Print test summary
   */
  private printTestSummary(): void {
    const totalTests = this.results.length;
    const passedTests = this.results.filter(r => r.success).length;
    const failedTests = totalTests - passedTests;

    console.log('\n📊 VECTORIZATION SYSTEM TEST SUMMARY');
    console.log('=====================================');
    console.log(`Total Tests: ${totalTests}`);
    console.log(`✅ Passed: ${passedTests}`);
    console.log(`❌ Failed: ${failedTests}`);
    console.log(`Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);

    if (failedTests > 0) {
      console.log('\n❌ FAILED TESTS:');
      this.results
        .filter(r => !r.success)
        .forEach(r => console.log(`  - ${r.component}: ${r.test} - ${r.error}`));
    }

    console.log('\n🎯 SYSTEM STATUS:');
    if (passedTests >= totalTests * 0.8) {
      console.log('✅ Vectorization system is ready for production!');
    } else {
      console.log('⚠️ Vectorization system needs attention before production use.');
    }
  }
}

// Export test function for manual execution
export async function testVectorizationSystem(): Promise<TestResult[]> {
  const tester = new VectorizationTester();
  return await tester.runAllTests();
}

// For direct execution
if (require.main === module) {
  testVectorizationSystem()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Test execution failed:', error);
      process.exit(1);
    });
}
