import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Mic, MicOff, Volume2, VolumeX, Send, User, Bot, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getAIChatResponse } from "@/lib/api";
import { useSpeechSynthesis } from "@/hooks/useSpeechSyntesis";

const AIAssistant = () => {
	const { isSupported, isSpeaking, voices, speak, stop } = useSpeechSynthesis();

	const defaultVoiceName = voices.find(v => v.lang.startsWith("id-ID"))?.name || voices[0]?.name;
	const [selectedVoice, setSelectedVoice] = useState("");

	useEffect(() => {
		if (defaultVoiceName) {
			setSelectedVoice(defaultVoiceName);
		}
	}, [defaultVoiceName]);


	const [selectedAvatar, setSelectedAvatar] = useState("teacher");
	const [isRecording, setIsRecording] = useState(false);
	const [inputText, setInputText] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [conversation, setConversation] = useState<
		Array<{
			id: number;
			sender: "user" | "ai";
			message: string;
			timestamp: Date;
		}>
	>([
		{
			id: 1,
			sender: "ai",
			message:
				"Halo! Saya Matea, asisten AI Anda. Saya siap membantu menjelaskan materi pembelajaran. Apa yang ingin Anda pelajari hari ini?",
			timestamp: new Date(),
		},
	]);

	const avatars = [
		{
			id: "teacher",
			name: "Guru Matea",
			image: "/api/placeholder/64/64",
			description: "Avatar guru yang berpengalaman",
		},
		{
			id: "student",
			name: "Teman Belajar",
			image: "/api/placeholder/64/64",
			description: "Avatar teman sebaya",
		},
		{
			id: "professor",
			name: "Profesor",
			image: "/api/placeholder/64/64",
			description: "Avatar akademisi senior",
		},
		{
			id: "tutor",
			name: "Tutor Pribadi",
			image: "/api/placeholder/64/64",
			description: "Avatar tutor personal",
		},
	];

	const handleSendMessage = async () => {
		if (!inputText.trim() || isLoading) return;

		const userMessage = {
			id: conversation.length + 1,
			sender: "user" as const,
			message: inputText,
			timestamp: new Date(),
		};

		setConversation((prev) => [...prev, userMessage]);
		const textToProcess = inputText;
		setInputText("");
		setIsLoading(true);

		try {
			const aiData = await getAIChatResponse(textToProcess);
			const aiResponse = {
				id: conversation.length + 2,
				sender: "ai" as const,
				message: aiData.response,
				timestamp: new Date(),
			};
			setConversation((prev) => [...prev, aiResponse]);
			
			if (isSupported && selectedVoice) {
				// Gunakan fungsi pembersih di sini
				const textToSpeak = cleanTextForSpeech(aiData.response);
				speak(textToSpeak, selectedVoice);
			}

		} catch (error) {
			console.error("Error getting AI response:", error);
			const errorResponse = {
				id: conversation.length + 2,
				sender: "ai" as const,
				message: "Maaf, terjadi kesalahan saat memproses permintaan Anda.",
				timestamp: new Date(),
			};
			setConversation((prev) => [...prev, errorResponse]);
		} finally {
			setIsLoading(false);
		}
	};

	const toggleRecording = () => {
		setIsRecording(!isRecording);
	};

	const handlePlaybackToggle = () => {
		if (isSpeaking) {
			stop();
		} else {
			const lastAiMessage = [...conversation].reverse().find(m => m.sender === 'ai');
			if (lastAiMessage && isSupported && selectedVoice) {
				speak(lastAiMessage.message, selectedVoice);
			}
		}
	}

	const getCurrentAvatar = () => {
		return avatars.find((a) => a.id === selectedAvatar) || avatars[0];
	};

	const cleanTextForSpeech = (text: string): string => {
		let cleanedText = text.replace(/[#*"`_~[\]()]/g, '');

		cleanedText = cleanedText.replace(/\s+/g, ' ').trim();

		return cleanedText;
	};

	return (
		<div className="min-h-screen bg-background pt-20 p-6">
			<div className="container mx-auto max-w-6xl">
				<div className="text-center mb-8">
					<h1 className="text-4xl font-bold mb-4 bg-gradient-primary bg-clip-text text-transparent">
						Asisten AI Matea
					</h1>
					<p className="text-muted-foreground text-lg">
						Belajar dengan bantuan AI yang dapat berbicara dan
						menjelaskan
					</p>
				</div>

				<div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
					{/* Settings Panel */}
					<div className="space-y-4">
						<Card>
							<CardHeader>
								<CardTitle className="text-lg">
									Pengaturan Avatar
								</CardTitle>
							</CardHeader>
							<CardContent className="space-y-4">
								<div>
									<label className="text-sm font-medium">
										Pilih Avatar
									</label>
									<Select
										value={selectedAvatar}
										onValueChange={setSelectedAvatar}
									>
										<SelectTrigger className="mt-2">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											{avatars.map((avatar) => (
												<SelectItem
													key={avatar.id}
													value={avatar.id}
												>
													<div className="flex items-center gap-2">
														<Avatar className="h-6 w-6">
															<AvatarImage
																src={
																	avatar.image
																}
															/>
															<AvatarFallback>
																{avatar.name[0]}
															</AvatarFallback>
														</Avatar>
														<span>
															{avatar.name}
														</span>
													</div>
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									<p className="text-xs text-muted-foreground mt-1">
										{getCurrentAvatar().description}
									</p>
								</div>

								<div>
									<label className="text-sm font-medium">
										Pilih Suara
									</label>
									<Select
										value={selectedVoice}
										onValueChange={setSelectedVoice}
										disabled={!isSupported || voices.length === 0}
									>
										<SelectTrigger className="mt-2">
											<SelectValue placeholder="Memuat suara..." />
										</SelectTrigger>
										<SelectContent>
											{voices.map((voice) => (
												<SelectItem
													key={voice.name}
													value={voice.name}
												>
													<div>
														<div className="font-medium">
															{voice.name} ({voice.lang})
														</div>
													</div>
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									{!isSupported && <p className="text-xs text-red-500 mt-1">Text-to-speech tidak didukung di browser ini.</p>}
								</div>

								<div className="flex items-center justify-center pt-4">
									<Avatar className="h-20 w-20">
										<AvatarImage
											src={getCurrentAvatar().image}
										/>
										<AvatarFallback className="text-lg bg-gradient-primary text-primary-foreground">
											{getCurrentAvatar().name[0]}
										</AvatarFallback>
									</Avatar>
								</div>

								{isSpeaking && (
									<Badge className="w-full justify-center bg-gradient-success text-success-foreground">
										🎤 Sedang berbicara...
									</Badge>
								)}
							</CardContent>
						</Card>
					</div>

					{/* Chat Interface */}
					<div className="lg:col-span-3">
						<Card className="h-[600px] flex flex-col">
							<CardHeader className="flex-shrink-0">
								<CardTitle className="flex items-center gap-2">
									<Bot className="h-5 w-5" />
									Percakapan dengan {getCurrentAvatar().name}
								</CardTitle>
							</CardHeader>

							<CardContent className="flex-1 flex flex-col min-h-0 p-4">
								{/* Messages */}
								<div className="flex-1 overflow-y-auto overflow-x-hidden space-y-4 mb-4 pr-2 scrollbar-thin">
									{conversation.map((msg) => (
										<div
											key={msg.id}
											className={`flex gap-3 ${
												msg.sender === "user"
													? "flex-row-reverse"
													: ""
											}`}
										>
											<Avatar className="h-8 w-8 flex-shrink-0">
												{msg.sender === "ai" ? (
													<>
														<AvatarImage
															src={
																getCurrentAvatar()
																	.image
															}
														/>
														<AvatarFallback className="bg-gradient-primary text-primary-foreground">
															{
																getCurrentAvatar()
																	.name[0]
															}
														</AvatarFallback>
													</>
												) : (
													<>
														<AvatarFallback className="bg-accent text-accent-foreground">
															<User className="h-4 w-4" />
														</AvatarFallback>
													</>
												)}
											</Avatar>
											<div
												className={`flex-1 max-w-[calc(100%-4rem)] p-3 rounded-lg break-words ${
													msg.sender === "user"
														? "bg-gradient-primary text-primary-foreground"
														: "bg-muted"
												}`}
											>
												<p className="text-sm leading-relaxed break-words whitespace-pre-wrap">
													{msg.message}
												</p>
												<p className="text-xs opacity-70 mt-1">
													{msg.timestamp.toLocaleTimeString(
														"id-ID",
														{
															hour: "2-digit",
															minute: "2-digit",
														}
													)}
												</p>
											</div>
										</div>
									))}
									{isLoading && (
										<div className="flex gap-3">
											<Avatar className="h-8 w-8 flex-shrink-0">
												<AvatarImage src={getCurrentAvatar().image} />
												<AvatarFallback className="bg-gradient-primary text-primary-foreground">
													{getCurrentAvatar().name[0]}
												</AvatarFallback>
											</Avatar>
											<div className="flex-1 max-w-[calc(100%-4rem)] p-3 rounded-lg bg-muted flex items-center">
												<Loader2 className="h-5 w-5 animate-spin" />
											</div>
										</div>
									)}
								</div>

								{/* Input Area */}
								<div className="border-t pt-4 flex-shrink-0">
									<div className="flex gap-2">
										<Textarea
											value={inputText}
											onChange={(e) =>
												setInputText(e.target.value)
											}
											placeholder="Tanyakan tentang materi pembelajaran..."
											className="flex-1 min-h-[40px] max-h-[120px] resize-none"
											onKeyPress={(e) => {
												if (
													e.key === "Enter" &&
													!e.shiftKey
												) {
													e.preventDefault();
													handleSendMessage();
												}
											}}
											disabled={isLoading}
										/>
										<div className="flex flex-col gap-2 flex-shrink-0">
											<Button
												variant={
													isRecording
														? "destructive"
														: "outline"
												}
												size="sm"
												onClick={toggleRecording}
												disabled={isLoading}
											>
												{isRecording ? (
													<MicOff className="h-4 w-4" />
												) : (
													<Mic className="h-4 w-4" />
												)}
											</Button>
											<Button
												variant={
													isSpeaking
														? "secondary"
														: "outline"
												}
												size="sm"
												onClick={handlePlaybackToggle}
												disabled={isLoading || !isSupported}
											>
												{isSpeaking ? (
													<VolumeX className="h-4 w-4" />
												) : (
													<Volume2 className="h-4 w-4" />
												)}
											</Button>
											<Button
												onClick={handleSendMessage}
												disabled={!inputText.trim() || isLoading}
												className="bg-gradient-primary hover:bg-gradient-primary/90"
												size="sm"
											>
												{isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
											</Button>
										</div>
									</div>

									{isRecording && (
										<Badge className="mt-2 bg-destructive text-destructive-foreground">
											🔴 Sedang merekam... (klik untuk
											berhenti)
										</Badge>
									)}
								</div>
							</CardContent>
						</Card>
					</div>
				</div>

				{/* Quick Actions */}
				<Card className="mt-6">
					<CardHeader>
						<CardTitle>Contoh Pertanyaan</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
							{[
								"Jelaskan tentang fotosintesis dengan mudah",
								"Bagaimana cara menghitung luas segitiga?",
								"Ceritakan tentang Proklamasi Indonesia",
								"Apa itu hukum Newton?",
								"Jelaskan sistem tata surya",
								"Bagaimana proses respirasi pada manusia?",
							].map((question, index) => (
								<Button
									key={index}
									variant="outline"
									className="h-auto p-3 text-left justify-start"
									onClick={() => setInputText(question)}
									disabled={isLoading}
								>
									<span className="text-sm">{question}</span>
								</Button>
							))}
						</div>
					</CardContent>
				</Card>
			</div>
		</div>
	);
};

export default AIAssistant;