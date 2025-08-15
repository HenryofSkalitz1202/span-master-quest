import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Upload, FileText, Sparkles, Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const LearningMaterials = () => {
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [questions, setQuestions] = useState<Array<{
    id: number;
    question: string;
    options: string[];
    correct: number;
    explanation: string;
  }>>([]);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type === "application/pdf") {
      setUploadedFile(file);
    }
  };

  const generateQuestions = async () => {
    if (!uploadedFile) return;
    
    setIsGenerating(true);
    
    // Simulate AI question generation
    setTimeout(() => {
      const sampleQuestions = [
        {
          id: 1,
          question: "Apa yang dimaksud dengan fotosintesis?",
          options: [
            "Proses pembuatan makanan oleh tumbuhan",
            "Proses pernapasan tumbuhan",
            "Proses reproduksi tumbuhan",
            "Proses pertumbuhan tumbuhan"
          ],
          correct: 0,
          explanation: "Fotosintesis adalah proses pembuatan makanan oleh tumbuhan menggunakan sinar matahari, air, dan karbon dioksida."
        },
        {
          id: 2,
          question: "Organ manakah yang berperan utama dalam fotosintesis?",
          options: ["Akar", "Batang", "Daun", "Bunga"],
          correct: 2,
          explanation: "Daun mengandung klorofil yang berperan penting dalam proses fotosintesis."
        },
        {
          id: 3,
          question: "Gas apa yang dihasilkan dalam proses fotosintesis?",
          options: ["Karbon dioksida", "Oksigen", "Nitrogen", "Hidrogen"],
          correct: 1,
          explanation: "Oksigen (O₂) adalah gas yang dihasilkan sebagai produk sampingan fotosintesis."
        }
      ];
      
      setQuestions(sampleQuestions);
      setIsGenerating(false);
    }, 3000);
  };

  return (
    <div className="min-h-screen bg-background pt-20 p-6">
      <div className="container mx-auto max-w-4xl">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-4 bg-gradient-primary bg-clip-text text-transparent">
            Materi Pembelajaran AI
          </h1>
          <p className="text-muted-foreground text-lg">
            Upload materi PDF dan biarkan AI membuat soal-soal menarik untuk Anda
          </p>
        </div>

        {/* Upload Section */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Upload Materi PDF
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <Label htmlFor="pdf-upload">Pilih file PDF</Label>
                <Input
                  id="pdf-upload"
                  type="file"
                  accept=".pdf"
                  onChange={handleFileUpload}
                  className="mt-2"
                />
              </div>
              
              {uploadedFile && (
                <div className="flex items-center gap-2 p-3 bg-accent/50 rounded-lg">
                  <FileText className="h-4 w-4 text-accent" />
                  <span className="text-sm">{uploadedFile.name}</span>
                  <Badge variant="secondary">{(uploadedFile.size / 1024 / 1024).toFixed(1)} MB</Badge>
                </div>
              )}
              
              <Button 
                onClick={generateQuestions}
                disabled={!uploadedFile || isGenerating}
                className="bg-gradient-primary hover:bg-gradient-primary/90"
              >
                <Sparkles className="h-4 w-4 mr-2" />
                {isGenerating ? "Membuat Soal..." : "Buat Soal dengan AI"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Generated Questions */}
        {questions.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Soal yang Dihasilkan AI</span>
                <Badge variant="outline">{questions.length} soal</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {questions.map((q, index) => (
                  <div key={q.id} className="p-4 border rounded-lg bg-card/50">
                    <div className="flex items-start gap-3 mb-4">
                      <Badge className="bg-gradient-primary text-primary-foreground">
                        {index + 1}
                      </Badge>
                      <div className="flex-1">
                        <h3 className="font-medium mb-3">{q.question}</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {q.options.map((option, optIndex) => (
                            <Button
                              key={optIndex}
                              variant={optIndex === q.correct ? "default" : "outline"}
                              size="sm"
                              className={`justify-start h-auto p-3 text-left ${
                                optIndex === q.correct 
                                  ? "bg-gradient-success text-success-foreground" 
                                  : ""
                              }`}
                            >
                              <span className="mr-2 font-bold">
                                {String.fromCharCode(65 + optIndex)}.
                              </span>
                              {option}
                            </Button>
                          ))}
                        </div>
                        <div className="mt-3 p-3 bg-muted/50 rounded text-sm">
                          <strong>Penjelasan:</strong> {q.explanation}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                
                <div className="flex justify-center gap-4 pt-4">
                  <Button variant="outline">
                    <Download className="h-4 w-4 mr-2" />
                    Export Soal
                  </Button>
                  <Button className="bg-gradient-accent hover:bg-gradient-accent/90">
                    <Sparkles className="h-4 w-4 mr-2" />
                    Mulai Kuis
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Instructions */}
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Cara Menggunakan</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>• Upload file PDF materi pembelajaran Anda</li>
              <li>• AI akan menganalisis konten dan membuat soal-soal interaktif</li>
              <li>• Soal dibuat dalam gaya Quizizz yang menyenangkan</li>
              <li>• Anda dapat langsung mengerjakan kuis atau mengekspor soal</li>
              <li>• Mendukung berbagai jenis materi: biologi, matematika, sejarah, dll.</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default LearningMaterials;