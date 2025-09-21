import React from "react";
import { SYSTEM_MESSAGE_PRESETS } from "../hooks/useAzureAI";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";

interface SystemMessageSelectorProps {
  selectedPreset: keyof typeof SYSTEM_MESSAGE_PRESETS | "custom";
  customMessage?: string;
  onPresetChange: (preset: keyof typeof SYSTEM_MESSAGE_PRESETS | "custom", message?: string) => void;
}

const PRESET_DESCRIPTIONS = {
  DEFAULT: "General purpose assistant with balanced responses",
  PROFESSIONAL: "Formal business communication style",
  CREATIVE: "Engaging creative writing and storytelling", 
  TECHNICAL: "Precise technical documentation and code",
  CASUAL: "Friendly, conversational, and approachable",
  SOCRATIC_TUTOR: "Guides learning through questions rather than answers",
  DEVILS_ADVOCATE: "Challenges ideas to strengthen arguments",
  HISTORIAN: "Rich narrative storytelling about historical events",
  MINDFULNESS_COACH: "Gentle wellness and grounding techniques",
  ROMANTIC_POET: "Crafts beautiful romantic poetry and prose", 
  CHARMING_FLIRT: "Playful, witty, and respectful banter",
  DATE_NIGHT_PLANNER: "Creative and personalized romantic experiences"
} as const;

const PRESET_CATEGORIES = {
  "Core Personalities": ["DEFAULT", "PROFESSIONAL", "CREATIVE", "TECHNICAL", "CASUAL"],
  "Learning & Growth": ["SOCRATIC_TUTOR", "DEVILS_ADVOCATE", "HISTORIAN"],
  "Wellness & Support": ["MINDFULNESS_COACH"],
  "Romance & Relationships": ["ROMANTIC_POET", "CHARMING_FLIRT", "DATE_NIGHT_PLANNER"]
} as const;

export const SystemMessageSelector: React.FC<SystemMessageSelectorProps> = ({
  selectedPreset,
  customMessage,
  onPresetChange
}) => {
  return (
    <div className="w-full space-y-4">
      <div className="text-center space-y-2">
        <div className="flex items-center justify-center gap-2">
          <h3 className="text-lg font-semibold text-white">Make Uterpi your own</h3>
        </div>
        <p className="text-sm text-slate-300">
          Choose how Uterpi's AI should respond and communicate with you
        </p>
      </div>

      <div className="space-y-6">
        {Object.entries(PRESET_CATEGORIES).map(([categoryName, presets]) => (
          <div key={categoryName} className="space-y-3">
            <h4 className="text-sm font-medium text-slate-200 uppercase tracking-wide border-b border-slate-600 pb-1">
              {categoryName}
            </h4>
            <div className="grid grid-cols-1 gap-2">
              {presets.map((preset) => (
                <Button
                  key={preset}
                  variant={selectedPreset === preset ? "default" : "outline"}
                  size="sm"
                  onClick={() => onPresetChange(preset)}
                  className="h-auto p-3 text-left justify-start bg-slate-800/50 hover:bg-slate-700/50 border-slate-600"
                >
                  <div className="w-full">
                    <div className="font-medium text-sm uppercase tracking-wide mb-1 text-white">
                      {preset.replace(/_/g, ' ')}
                    </div>
                    <div className="text-xs text-slate-300 leading-relaxed break-words">
                      {PRESET_DESCRIPTIONS[preset as keyof typeof PRESET_DESCRIPTIONS]}
                    </div>
                  </div>
                </Button>
              ))}
            </div>
          </div>
        ))}
        
        <div className="pt-3 border-t border-slate-600">
          <Button
            variant={selectedPreset === "custom" ? "default" : "outline"}
            size="sm"
            onClick={() => onPresetChange("custom", customMessage)}
            className="w-full bg-slate-800/50 hover:bg-slate-700/50 border-slate-600"
          >
            <span className="font-medium">Custom System Message</span>
          </Button>
        </div>

        {selectedPreset !== "custom" && (
          <div className="mt-4 p-4 bg-slate-800/30 backdrop-blur-sm rounded-lg border border-slate-600/50">
            <p className="text-sm font-medium mb-3 text-white">Current System Message:</p>
            <div className="bg-slate-900/50 rounded-md p-3 border border-slate-700/50">
              <p className="text-xs text-slate-300 whitespace-pre-line leading-relaxed break-words">
                {SYSTEM_MESSAGE_PRESETS[selectedPreset as keyof typeof SYSTEM_MESSAGE_PRESETS]}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}; 