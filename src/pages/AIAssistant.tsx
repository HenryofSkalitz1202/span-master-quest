import { useState, useEffect, useRef } from "react";
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
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
	DialogDescription,
} from "@/components/ui/dialog";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Mic, MicOff, Volume2, VolumeX, Send, User, Bot, Loader2, PlusCircle, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getAIChatResponse } from "@/lib/api";
import { useSpeechSynthesis } from "@/hooks/useSpeechSyntesis";

interface Message {
	id: number;
	sender: "user" | "ai";
	message: string;
	timestamp: Date;
}

interface ChatSession {
	id: string;
	title: string;
	avatarId: string;
	conversation: Message[];
	createdAt: Date;
}

const AIAssistant = () => {
	const { isSupported, isSpeaking, voices, speak, stop } = useSpeechSynthesis();

	const defaultVoiceName = voices.find(v => v.lang.startsWith("id-ID"))?.name || voices[0]?.name;
	const [selectedVoice, setSelectedVoice] = useState("");
	const messagesEndRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (defaultVoiceName) {
			setSelectedVoice(defaultVoiceName);
		}
	}, [defaultVoiceName]);

	const [isRecording, setIsRecording] = useState(false);
	const [inputText, setInputText] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [isAvatarSelectorOpen, setIsAvatarSelectorOpen] = useState(false);
	const [sessionToDelete, setSessionToDelete] = useState<string | null>(null);


	const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
	const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

	const activeConversation = chatSessions.find(s => s.id === activeSessionId)?.conversation || [];

	useEffect(() => {
		const savedSessions = localStorage.getItem('chatSessions');
		if (savedSessions) {
			const parsedSessions = JSON.parse(savedSessions).map((session: any) => ({
				...session,
				createdAt: new Date(session.createdAt),
				conversation: session.conversation.map((msg: any) => ({
					...msg,
					timestamp: new Date(msg.timestamp)
				}))
			}));
			setChatSessions(parsedSessions);
			if (parsedSessions.length > 0) {
				setActiveSessionId(parsedSessions[0].id);
			} else {
				setIsAvatarSelectorOpen(true);
			}
		} else {
			setIsAvatarSelectorOpen(true);
		}
	}, []);

	useEffect(() => {
		// Avoid saving an empty array to localStorage on initial load
		if (chatSessions.length > 0 || localStorage.getItem('chatSessions')) {
			localStorage.setItem('chatSessions', JSON.stringify(chatSessions));
		}
	}, [chatSessions]);

	useEffect(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [activeConversation]);

	const createNewSession = (avatarId: string) => {
		const newSession: ChatSession = {
			id: `session_${Date.now()}`,
			title: "Percakapan Baru",
			avatarId: avatarId,
			createdAt: new Date(),
			conversation: [
				{
					id: 1,
					sender: "ai",
					message:
						"Halo! Saya Matea, asisten AI Anda. Saya siap membantu menjelaskan materi pembelajaran. Apa yang ingin Anda pelajari hari ini?",
					timestamp: new Date(),
				},
			]
		};
		setChatSessions(prev => [newSession, ...prev]);
		setActiveSessionId(newSession.id);
		setIsAvatarSelectorOpen(false);
	};

	const handleDeleteSession = (sessionId: string) => {
		const newSessions = chatSessions.filter(session => session.id !== sessionId);
		setChatSessions(newSessions);

		if (activeSessionId === sessionId) {
			if (newSessions.length > 0) {
				setActiveSessionId(newSessions[0].id);
			} else {
				setActiveSessionId(null);
				setIsAvatarSelectorOpen(true);
			}
		}
		setSessionToDelete(null);
	};


	const avatars = [
		{
			id: "teacher",
			name: "Guru Matea",
			image: "src/assets/teacher-icon.jpg",
			description: "Avatar guru yang berpengalaman",
		},
		{
			id: "student",
			name: "Teman Belajar",
			image: "src/assets/friend-icon.png",
			description: "Avatar teman sebaya",
		}
	];

	const handleSendMessage = async () => {
		if (!inputText.trim() || isLoading || !activeSessionId) return;

		const userMessage: Message = {
			id: activeConversation.length + 1,
			sender: "user" as const,
			message: inputText,
			timestamp: new Date(),
		};

		const updatedConversation = [...activeConversation, userMessage];
		const currentTitle = chatSessions.find(s => s.id === activeSessionId)?.title;
		const newTitle = currentTitle === "Percakapan Baru" && updatedConversation.length > 1 ? inputText.substring(0, 30) + '...' : currentTitle;

		setChatSessions(sessions => sessions.map(s => s.id === activeSessionId ? { ...s, conversation: updatedConversation, title: newTitle || s.title } : s));

		const textToProcess = inputText;
		setInputText("");
		setIsLoading(true);

		try {
			const currentSession = chatSessions.find(s => s.id === activeSessionId);
			const aiData = await getAIChatResponse(textToProcess, currentSession?.avatarId || 'teacher');

			const aiResponse: Message = {
				id: updatedConversation.length + 1,
				sender: "ai" as const,
				message: aiData.response,
				timestamp: new Date(),
			};

			setChatSessions(sessions => sessions.map(s => s.id === activeSessionId ? { ...s, conversation: [...updatedConversation, aiResponse] } : s));

			if (isSupported && selectedVoice) {
				const textToSpeak = cleanTextForSpeech(aiData.response);
				speak(textToSpeak, selectedVoice);
			}

		} catch (error) {
			console.error("Error getting AI response:", error);
			const errorResponse: Message = {
				id: updatedConversation.length + 1,
				sender: "ai" as const,
				message: "Maaf, terjadi kesalahan saat memproses permintaan Anda.",
				timestamp: new Date(),
			};
			setChatSessions(sessions => sessions.map(s => s.id === activeSessionId ? { ...s, conversation: [...updatedConversation, errorResponse] } : s));
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
			const lastAiMessage = [...activeConversation].reverse().find(m => m.sender === 'ai');
			if (lastAiMessage && isSupported && selectedVoice) {
				speak(lastAiMessage.message, selectedVoice);
			}
		}
	}

	const getCurrentAvatar = () => {
		const avatarId = chatSessions.find(s => s.id === activeSessionId)?.avatarId || 'teacher';
		return avatars.find((a) => a.id === avatarId) || avatars[0];
	};

	const cleanTextForSpeech = (text: string): string => {
		let cleanedText = text.replace(/[#*"`_~[\]()]/g, '');
		cleanedText = cleanedText.replace(/\s+/g, ' ').trim();
		return cleanedText;
	};

	return (
		<div className="flex h-screen bg-background">
			{/* Chat History Sidebar */}
			<div className="w-1/4 bg-muted/50 border-r flex flex-col">
				<div className="p-4 border-b">
					<h2 className="text-xl font-bold">Riwayat Chat</h2>
				</div>
				<div className="flex-1 overflow-y-auto">
					{chatSessions.map(session => (
						<div
							key={session.id}
							className={`flex items-center justify-between p-4 cursor-pointer hover:bg-muted ${activeSessionId === session.id ? 'bg-muted' : ''}`}
							onClick={() => setActiveSessionId(session.id)}
						>
							<div className="flex-1 truncate">
								<div className="font-semibold truncate">{session.title}</div>
								<div className="text-xs text-muted-foreground">{session.createdAt.toLocaleDateString()}</div>
							</div>
							<AlertDialog>
								<AlertDialogTrigger asChild>
									<Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); setSessionToDelete(session.id); }}>
										<Trash2 className="h-4 w-4" />
									</Button>
								</AlertDialogTrigger>
								<AlertDialogContent>
									<AlertDialogHeader>
										<AlertDialogTitle>Apakah Anda yakin?</AlertDialogTitle>
										<AlertDialogDescription>
											Tindakan ini tidak dapat dibatalkan. Ini akan menghapus percakapan secara permanen.
										</AlertDialogDescription>
									</AlertDialogHeader>
									<AlertDialogFooter>
										<AlertDialogCancel onClick={(e) => { e.stopPropagation(); setSessionToDelete(null); }}>Batal</AlertDialogCancel>
										<AlertDialogAction onClick={(e) => { e.stopPropagation(); if (sessionToDelete) handleDeleteSession(sessionToDelete); }}>Lanjutkan</AlertDialogAction>
									</AlertDialogFooter>
								</AlertDialogContent>
							</AlertDialog>
						</div>
					))}
				</div>
				<div className="p-4 border-t">
					<Button className="w-full" onClick={() => setIsAvatarSelectorOpen(true)}>
						<PlusCircle className="mr-2 h-4 w-4" /> Percakapan Baru
					</Button>
				</div>
			</div>

			<Dialog open={isAvatarSelectorOpen} onOpenChange={setIsAvatarSelectorOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Pilih Avatar</DialogTitle>
						<DialogDescription>Pilih avatar untuk memulai percakapan baru.</DialogDescription>
					</DialogHeader>
					<div className="flex justify-around pt-4">
						{avatars.map(avatar => (
							<div key={avatar.id} className="text-center">
								<Avatar className="h-24 w-24 cursor-pointer" onClick={() => createNewSession(avatar.id)}>
									<AvatarImage src={avatar.image} />
									<AvatarFallback>{avatar.name[0]}</AvatarFallback>
								</Avatar>
								<p className="mt-2 font-semibold">{avatar.name}</p>
							</div>
						))}
					</div>
				</DialogContent>
			</Dialog>

			<div className="flex-1 flex flex-col">
				<div className="min-h-screen pt-20 p-6 flex-1 overflow-y-auto">
					{activeSessionId ? (
						<div className="container mx-auto max-w-4xl">
							{/* Chat Interface */}
							<Card className="h-[calc(100vh-10rem)] flex flex-col">
								<CardHeader className="flex-shrink-0 flex flex-row items-center justify-between">
									<div className="flex items-center gap-2">
										<Avatar className="h-8 w-8">
											<AvatarImage src={getCurrentAvatar().image} />
											<AvatarFallback>{getCurrentAvatar().name[0]}</AvatarFallback>
										</Avatar>
										<CardTitle>
											Percakapan dengan {getCurrentAvatar().name}
										</CardTitle>
									</div>
									<div className="w-1/3">
										<Select
											value={selectedVoice}
											onValueChange={setSelectedVoice}
											disabled={!isSupported || voices.length === 0}
										>
											<SelectTrigger>
												<SelectValue placeholder="Pilih suara..." />
											</SelectTrigger>
											<SelectContent>
												{voices.map((voice) => (
													<SelectItem
														key={voice.name}
														value={voice.name}
													>
														{voice.name} ({voice.lang})
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>
								</CardHeader>

								<CardContent className="flex-1 flex flex-col min-h-0 p-4">
									<div className="flex-1 overflow-y-auto overflow-x-hidden space-y-4 mb-4 pr-2 scrollbar-thin">
										{activeConversation.map((msg) => (
											<div
												key={msg.id}
												className={`flex gap-3 ${msg.sender === "user"
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
													className={`flex-1 max-w-[calc(100%-4rem)] p-3 rounded-lg break-words ${msg.sender === "user"
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
										<div ref={messagesEndRef} />
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
											<div className="flex items-center gap-2 flex-shrink-0">
												<Button
													variant="outline"
													size="icon"
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
													variant="outline"
													size="icon"
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
													size="icon"
												>
													{isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
												</Button>
											</div>
										</div>
									</div>
								</CardContent>
							</Card>
						</div>
					) : (
						<div className="flex flex-col items-center justify-center h-full">
							<h2 className="text-2xl font-semibold text-muted-foreground">Pilih atau buat percakapan baru</h2>
							<p className="text-muted-foreground">Mulai belajar dengan asisten AI Anda.</p>
							<Button className="mt-4" onClick={() => setIsAvatarSelectorOpen(true)}>
								<PlusCircle className="mr-2 h-4 w-4" /> Mulai Percakapan
							</Button>
						</div>
					)}
				</div>
			</div>
		</div>
	);
};

export default AIAssistant;