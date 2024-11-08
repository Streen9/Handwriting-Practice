import { useState, useCallback } from "react";
import DrawingBoard from "./components/DrawingBoard";
import LanguageSelector from "./components/LanguageSelector";
import LanguageGuidance from "./components/LanguageGuidance";
import RealTimeFeedback from "./components/RealTimeFeedback";
import {
  GeminiStreamingAnalysis,
  GeminiPrompt,
  AnalysisCallbacks,
} from "./services/GeminiStreamingAnalysis";
import { LANGUAGE_DATA } from "./constants/languageData";
import {
  StrokeData,
  LanguageInfo,
  LanguageChangeInfo,
  CharacterChangeInfo,
  AnalysisResults,
} from "./types";

const App = () => {
  // State management with proper typing
  const [currentLanguage, setCurrentLanguage] = useState<string>("english");
  const [currentCharacter, setCurrentCharacter] = useState<string | null>("A");
  const [currentLevel, setCurrentLevel] = useState<string>("beginner");
  const [strokeData, setStrokeData] = useState<StrokeData[]>([]);
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [, setAnalysisResults] = useState<AnalysisResults>({});
  const [geminiResponse, setGeminiResponse] = useState(null);

  // Initialize Gemini service
  const [strokeAnalysisService] = useState(
    new GeminiStreamingAnalysis(import.meta.env.VITE_APP_AI_KEY || "")
  );
  // Implement stroke analysis with streaming updates
  const analyzeStrokes = useCallback(
    async (
      strokes: StrokeData[],
      languageInfo: LanguageInfo
    ): Promise<void> => {
      // console.log("Starting stroke analysis...", {
      //   strokeCount: strokes.length,
      //   languageInfo,
      // });

      if (!strokes.length) {
        // console.log("No strokes to analyze");
        return;
      }

      try {
        // Convert strokes to image data
        const imageData = await convertStrokesToImage(strokes);
        // console.log("Image data generated, length:", imageData.length);

        const callbacks: AnalysisCallbacks = {
          onStrokeQuality: (analysis) => {
            // console.log("Received stroke quality analysis:", analysis);
            setAnalysisResults((prev) => ({
              ...prev,
              strokeQuality: analysis,
            }));
          },
          onLetterFormation: (analysis) => {
            // console.log("Received letter formation analysis:", analysis);
            setAnalysisResults((prev) => ({
              ...prev,
              letterFormation: analysis,
            }));
          },
          onNextStrokes: (strokes) => {
            // console.log("Received next strokes:", strokes);
            setAnalysisResults((prev) => ({
              ...prev,
              nextStrokes: strokes,
            }));
          },
          onCommonMistakes: (analysis) => {
            // console.log("Received common mistakes:", analysis);
            setAnalysisResults((prev) => ({
              ...prev,
              commonMistakes: analysis,
            }));
          },
          onRawResponse: (response) => {
            // Add this new callback
            // console.log("Received raw Gemini response:", response);
            setGeminiResponse(response);
          },
          onError: (error) => {
            console.error("Analysis error in callback:", error);
          },
        };

        // Create the analysis prompt
        const prompt: GeminiPrompt = {
          contents: [
            {
              parts: [
                {
                  inline_data: {
                    mime_type: "image/png",
                    data: imageData.split(",")[1],
                  },
                },
                {
                  text: `Analyze this handwritten ${languageInfo.language} character "${languageInfo.character}" 
                           (${languageInfo.level} level). Provide detailed feedback on:
                           1. Stroke quality and precision
                           2. Character formation and proportions
                           3. Next expected strokes or completions
                           4. Common mistakes and suggestions for improvement.
                           
                           Focus on script-specific features for the ${languageInfo.language} writing system.
                           
                           Additionally, provide an overall quality score of the handwriting as a percentage (0-100%).
        
                           Format your response with these exact headers:
                           **Current Stroke Quality**
                           **Letter Formation**
                           **Next Expected Strokes**
                           **Common Mistakes to Avoid**
                           **Overall Quality Score (%)**`,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.7,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 1024,
          },
        };

        // console.log("Sending API request to Gemini...");
        await strokeAnalysisService.analyzeWithGemini(prompt, callbacks);
        console.log("Analysis completed successfully");
      } catch (error) {
        console.error("Failed to analyze strokes:", error);
        throw error;
      }
    },
    [strokeAnalysisService]
  );
  const getCurrentLanguageInfo = useCallback((): LanguageInfo => {
    return {
      language: currentLanguage,
      script: LANGUAGE_DATA[currentLanguage]?.script || "Unknown",
      level: currentLevel,
      character: currentCharacter,
    };
  }, [currentLanguage, currentLevel, currentCharacter]);

  const handleLanguageChange = useCallback((info: LanguageChangeInfo): void => {
    setCurrentLanguage(info.language);
    setCurrentLevel(info.level);
    setCurrentCharacter(info.character);
    clearDrawing();
  }, []);

  const handleCharacterChange = useCallback(
    (info: CharacterChangeInfo): void => {
      setCurrentCharacter(info.character);
      setCurrentLevel(info.level);
      clearDrawing();
    },
    []
  );

  const handleStrokeUpdate = useCallback(
    async (newStrokeData: StrokeData[]): Promise<void> => {
      // console.log("Stroke Update:", newStrokeData.length, "strokes");
      setStrokeData(newStrokeData);

      // Check if we have new strokes to analyze
      if (newStrokeData.length > 0 && !isDrawing) {
        console.log("Triggering analysis for new strokes");
        const languageInfo = getCurrentLanguageInfo();
        await analyzeStrokes(newStrokeData, languageInfo);
      }
    },
    [analyzeStrokes, getCurrentLanguageInfo, isDrawing]
  );

  const handleDrawingStateChange = useCallback(
    async (drawing: boolean): Promise<void> => {
      // console.log("Drawing state changed:", drawing);
      setIsDrawing(drawing);

      // When stopping drawing, trigger immediate analysis
      if (!drawing && strokeData.length > 0) {
        console.log("Drawing stopped, triggering analysis");
        const languageInfo = getCurrentLanguageInfo();
        await analyzeStrokes(strokeData, languageInfo);
      }
    },
    [strokeData, getCurrentLanguageInfo, analyzeStrokes]
  );

  const clearDrawing = useCallback((): void => {
    setStrokeData([]);
    setIsDrawing(false);
    setAnalysisResults({});
    setIsAnalyzing(false);
  }, []);

  const convertStrokesToImage = (strokes: StrokeData[]): Promise<string> => {
    return new Promise((resolve) => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      canvas.width = 400;
      canvas.height = 400;

      if (ctx) {
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.strokeStyle = "black";
        ctx.lineWidth = 2;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        strokes.forEach((stroke) => {
          if (stroke.points.length > 0) {
            ctx.beginPath();
            ctx.moveTo(stroke.points[0][0], stroke.points[0][1]);
            stroke.points.forEach(([x, y]) => ctx.lineTo(x, y));
            ctx.stroke();
          }
        });
      }

      resolve(canvas.toDataURL("image/png"));
    });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto p-4">
        <header className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">
            Multilingual Handwriting Practice
          </h1>
          <p className="text-gray-600">
            Learn to write in multiple languages with AI-powered feedback
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-6">
            <LanguageSelector
              onLanguageChange={handleLanguageChange}
              onCharacterChange={handleCharacterChange}
              currentLanguage={currentLanguage}
              currentLevel={currentLevel}
            />

            <DrawingBoard
              onStrokeUpdate={handleStrokeUpdate}
              onDrawingStateChange={handleDrawingStateChange}
            />
          </div>

          <div className="space-y-6">
            {currentCharacter && (
              <>
                <RealTimeFeedback
                  strokeData={strokeData}
                  isDrawing={isDrawing}
                  isAnalyzing={isAnalyzing}
                  languageInfo={getCurrentLanguageInfo()}
                  geminiResponse={geminiResponse}
                />

                <LanguageGuidance
                  languageInfo={getCurrentLanguageInfo()}
                  strokeData={strokeData}
                />
              </>
            )}
          </div>
        </div>

        <footer className="mt-12 text-center text-gray-500 text-sm">
          <p>
            Powered by AI - Supports multiple writing systems and provides
            real-time feedback
          </p>
        </footer>
      </div>
    </div>
  );
};
export default App;
