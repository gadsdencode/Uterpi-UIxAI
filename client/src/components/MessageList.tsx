import React from 'react';
import { Message as MessageType } from '../types';
import Message from './Message';

const mockMessages: MessageType[] = [
  {
    id: '1',
    role: 'user',
    content: 'Design a sleek, modern, and minimalist AI chat UI that\'s both persuasive and impressive. It needs real-time streaming, multimodal input (text, voice, image), and dynamic response formatting (code blocks, rich text). Focus on a clean, contemporary design with subtle, sophisticated animations and intuitive controls for editing/sharing. The aesthetic should project advanced technology, ensuring a seamless, engaging, and highly impressive conversational experience that elevates the AI\'s perceived capabilities.',
    timestamp: new Date(Date.now() - 1000 * 60 * 5),
  },
  {
    id: '2',
    role: 'assistant',
    content: `Of course. Here is a basic structure for a React component to get you started. It uses TypeScript and Tailwind CSS for styling.

### Key Features:
- **Component Structure**: A simple, reusable component.
- **Styling**: Uses Tailwind CSS for a modern look.
- **TypeScript**: For type safety.

\`\`\`tsx
import React from 'react';

interface ChatBubbleProps {
  message: string;
  sender: 'user' | 'ai';
}

const ChatBubble: React.FC<ChatBubbleProps> = ({ message, sender }) => {
  const bubbleClasses = sender === 'user'
    ? 'bg-primary text-primary-foreground self-end'
    : 'bg-secondary text-secondary-foreground self-start';

  return (
    <div className={\`max-w-md w-full mx-2 my-1 p-3 rounded-lg \${bubbleClasses}\`}>
      <p>{message}</p>
    </div>
  );
};

export default ChatBubble;
\`\`\`

This component provides a solid foundation. Next, we can integrate state management and API calls to make it dynamic.`,
    timestamp: new Date(Date.now() - 1000 * 60 * 4),
  },
];

const MessageList: React.FC = () => {
  const messagesEndRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mockMessages]);

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      <div className="flex flex-col space-y-4">
        {mockMessages.map((msg) => (
          <Message key={msg.id} message={msg} />
        ))}
      </div>
      <div ref={messagesEndRef} />
    </div>
  );
};

export default MessageList;
