import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math"; // Impor plugin
import rehypeKatex from "rehype-katex"; // Impor plugin

import "katex/dist/katex.min.css"; // Impor stylesheet KaTeX
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
import {
	Mic,
	MicOff,
	Volume2,
	VolumeX,
	Send,
	User,
	Bot,
	Loader2,
	PlusCircle,
	Trash2,
	ChevronLeft,
	ChevronRight,
} from "lucide-react";
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
	const { isSupported, isSpeaking, voices, speak, stop } =
		useSpeechSynthesis();

	const defaultVoiceName =
		voices.find((v) => v.lang.startsWith("id-ID"))?.name || voices[0]?.name;
	const [selectedVoice, setSelectedVoice] = useState("");
	const messagesEndRef = useRef<HTMLDivElement>(null);
	const [isSidebarOpen, setIsSidebarOpen] = useState(false);

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

	const activeConversation =
		chatSessions.find((s) => s.id === activeSessionId)?.conversation || [];

	useEffect(() => {
		const savedSessions = localStorage.getItem("chatSessions");
		if (savedSessions) {
			const parsedSessions = JSON.parse(savedSessions).map(
				(session: any) => ({
					...session,
					createdAt: new Date(session.createdAt),
					conversation: session.conversation.map((msg: any) => ({
						...msg,
						timestamp: new Date(msg.timestamp),
					})),
				})
			);
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
		if (chatSessions.length > 0 || localStorage.getItem("chatSessions")) {
			localStorage.setItem("chatSessions", JSON.stringify(chatSessions));
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
			],
		};
		setChatSessions((prev) => [newSession, ...prev]);
		setActiveSessionId(newSession.id);
		setIsAvatarSelectorOpen(false);
		setIsSidebarOpen(false);
	};

	const handleDeleteSession = (sessionId: string) => {
		const newSessions = chatSessions.filter(
			(session) => session.id !== sessionId
		);
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

	const handleSessionClick = (sessionId: string) => {
		setActiveSessionId(sessionId);
		setIsSidebarOpen(false);
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
		},
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
		const currentTitle = chatSessions.find(
			(s) => s.id === activeSessionId
		)?.title;
		const newTitle =
			currentTitle === "Percakapan Baru" && updatedConversation.length > 1
				? inputText.substring(0, 30) + "..."
				: currentTitle;

		setChatSessions((sessions) =>
			sessions.map((s) =>
				s.id === activeSessionId
					? {
							...s,
							conversation: updatedConversation,
							title: newTitle || s.title,
					  }
					: s
			)
		);

		const textToProcess = inputText;
		setInputText("");
		setIsLoading(true);

		try {
			const currentSession = chatSessions.find(
				(s) => s.id === activeSessionId
			);
			const aiData = await getAIChatResponse(
				textToProcess,
				currentSession?.avatarId || "teacher"
			);

			const aiResponse: Message = {
				id: updatedConversation.length + 1,
				sender: "ai" as const,
				message: aiData.response,
				timestamp: new Date(),
			};

			setChatSessions((sessions) =>
				sessions.map((s) =>
					s.id === activeSessionId
						? {
								...s,
								conversation: [
									...updatedConversation,
									aiResponse,
								],
						  }
						: s
				)
			);

			if (isSupported && selectedVoice) {
				const textToSpeak = cleanTextForSpeech(aiData.response);
				speak(textToSpeak, selectedVoice);
			}
		} catch (error) {
			console.error("Error getting AI response:", error);
			const errorResponse: Message = {
				id: updatedConversation.length + 1,
				sender: "ai" as const,
				message:
					"Maaf, terjadi kesalahan saat memproses permintaan Anda.",
				timestamp: new Date(),
			};
			setChatSessions((sessions) =>
				sessions.map((s) =>
					s.id === activeSessionId
						? {
								...s,
								conversation: [
									...updatedConversation,
									errorResponse,
								],
						  }
						: s
				)
			);
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
			const lastAiMessage = [...activeConversation]
				.reverse()
				.find((m) => m.sender === "ai");
			if (lastAiMessage && isSupported && selectedVoice) {
				speak(lastAiMessage.message, selectedVoice);
			}
		}
	};

	const getCurrentAvatar = () => {
		const avatarId =
			chatSessions.find((s) => s.id === activeSessionId)?.avatarId ||
			"teacher";
		return avatars.find((a) => a.id === avatarId) || avatars[0];
	};

	const cleanTextForSpeech = (text: string): string => {
		let cleanedText = text.replace(/[#*"`_~[\]()]/g, "");
		cleanedText = cleanedText.replace(/\s+/g, " ").trim();
		return cleanedText;
	};

	return (
		<div className="flex h-screen bg-background relative">
			{/* Sidebar Toggle Tab */}
			<Button
				variant="secondary"
				size="icon"
				className={`absolute top-1/2 -translate-y-1/2 z-50 md:hidden h-24 w-8 rounded-r-lg rounded-l-none transition-all duration-300 ease-in-out
                    ${isSidebarOpen ? "left-[80vw] sm:left-[60vw]" : "left-0"}`}
				onClick={() => setIsSidebarOpen(!isSidebarOpen)}
			>
				{isSidebarOpen ? (
					<ChevronLeft className="h-6 w-6" />
				) : (
					<ChevronRight className="h-6 w-6" />
				)}
			</Button>

			{/* Overlay for mobile */}
			{isSidebarOpen && (
				<div
					className="fixed inset-0 bg-black/50 z-40 md:hidden"
					onClick={() => setIsSidebarOpen(false)}
				/>
			)}

			{/* Chat History Sidebar */}
			<div
				className={`${
					isSidebarOpen ? "translate-x-0" : "-translate-x-full"
				} md:translate-x-0 pt-36 md:pt-16 absolute md:relative w-4/5 sm:w-3/5 md:w-1/3 lg:w-1/4 h-full bg-muted border-r flex flex-col z-40 transition-transform duration-300`}
			>
				<div className="p-4 border-b">
					<h2 className="text-lg md:text-xl font-bold">
						Riwayat Chat
					</h2>
				</div>
				<div className="flex-1 overflow-y-auto">
					{chatSessions.map((session) => (
						<div
							key={session.id}
							className={`flex items-center justify-between p-3 md:p-4 cursor-pointer hover:bg-muted ${
								activeSessionId === session.id ? "bg-muted" : ""
							}`}
							onClick={() => handleSessionClick(session.id)}
						>
							<div className="flex-1 truncate">
								<div className="font-semibold truncate text-sm md:text-base">
									{session.title}
								</div>
								<div className="text-xs text-muted-foreground">
									{session.createdAt.toLocaleDateString()}
								</div>
							</div>
							<AlertDialog>
								<AlertDialogTrigger asChild>
									<Button
										variant="ghost"
										size="icon"
										className="h-7 w-7 md:h-8 md:w-8"
										onClick={(e) => {
											e.stopPropagation();
											setSessionToDelete(session.id);
										}}
									>
										<Trash2 className="h-3 w-3 md:h-4 md:w-4" />
									</Button>
								</AlertDialogTrigger>
								<AlertDialogContent className="max-w-[90vw] sm:max-w-lg">
									<AlertDialogHeader>
										<AlertDialogTitle>
											Apakah Anda yakin?
										</AlertDialogTitle>
										<AlertDialogDescription>
											Tindakan ini tidak dapat dibatalkan.
											Ini akan menghapus percakapan secara
											permanen.
										</AlertDialogDescription>
									</AlertDialogHeader>
									<AlertDialogFooter>
										<AlertDialogCancel
											onClick={(e) => {
												e.stopPropagation();
												setSessionToDelete(null);
											}}
										>
											Batal
										</AlertDialogCancel>
										<AlertDialogAction
											onClick={(e) => {
												e.stopPropagation();
												if (sessionToDelete)
													handleDeleteSession(
														sessionToDelete
													);
											}}
										>
											Lanjutkan
										</AlertDialogAction>
									</AlertDialogFooter>
								</AlertDialogContent>
							</AlertDialog>
						</div>
					))}
				</div>
				<div className="p-3 md:p-4 border-t">
					<Button
						className="w-full text-sm md:text-base"
						onClick={() => setIsAvatarSelectorOpen(true)}
					>
						<PlusCircle className="mr-2 h-3 w-3 md:h-4 md:w-4" />{" "}
						Percakapan Baru
					</Button>
				</div>
			</div>

			<Dialog
				open={isAvatarSelectorOpen}
				onOpenChange={setIsAvatarSelectorOpen}
			>
				<DialogContent className="max-w-[90vw] sm:max-w-md">
					<DialogHeader>
						<DialogTitle>Pilih Avatar</DialogTitle>
						<DialogDescription>
							Pilih avatar untuk memulai percakapan baru.
						</DialogDescription>
					</DialogHeader>
					<div className="flex justify-around pt-4">
						{avatars.map((avatar) => (
							<div key={avatar.id} className="text-center">
								<Avatar
									className="h-16 w-16 sm:h-20 sm:w-20 md:h-24 md:w-24 cursor-pointer"
									onClick={() => createNewSession(avatar.id)}
								>
									<AvatarImage src={avatar.image} />
									<AvatarFallback>
										{avatar.name[0]}
									</AvatarFallback>
								</Avatar>
								<p className="mt-2 text-sm md:text-base font-semibold">
									{avatar.name}
								</p>
							</div>
						))}
					</div>
				</DialogContent>
			</Dialog>

			<div className="flex-1 flex flex-col">
				<div className="h-full p-3 md:p-6 pt-16 md:pt-6 flex-1 overflow-y-auto">
					{activeSessionId ? (
						<div className="container pt-24 md:pt-16 mx-auto max-w-4xl h-full">
							{/* Chat Interface */}
							<Card className="h-full flex flex-col">
								<CardHeader className="flex-shrink-0">
									<CardTitle className="flex items-center gap-2 text-base md:text-xl">
										<Avatar className="h-6 w-6 md:h-8 md:w-8">
											<AvatarImage
												src={getCurrentAvatar().image}
											/>
											<AvatarFallback>
												{getCurrentAvatar().name[0]}
											</AvatarFallback>
										</Avatar>
										<span className="text-sm md:text-base">
											Percakapan dengan{" "}
											{getCurrentAvatar().name}
										</span>
									</CardTitle>
								</CardHeader>

								<CardContent className="flex-1 flex flex-col min-h-0 p-3 md:p-4">
									<div className="flex-1 overflow-y-auto overflow-x-hidden space-y-3 md:space-y-4 mb-3 md:mb-4 pr-1 md:pr-2 scrollbar-thin">
										{activeConversation.map((msg) => (
											<div
												key={msg.id}
												className={`flex gap-2 md:gap-3 ${
													msg.sender === "user"
														? "flex-row-reverse"
														: ""
												}`}
											>
												<Avatar className="h-6 w-6 md:h-8 md:w-8 flex-shrink-0">
													{msg.sender === "ai" ? (
														<>
															<AvatarImage
																src={
																	getCurrentAvatar()
																		.image
																}
															/>
															<AvatarFallback className="bg-gradient-primary text-primary-foreground text-xs md:text-sm">
																{
																	getCurrentAvatar()
																		.name[0]
																}
															</AvatarFallback>
														</>
													) : (
														<>
															<AvatarFallback className="bg-accent text-accent-foreground">
																<User className="h-3 w-3 md:h-4 md:w-4" />
															</AvatarFallback>
														</>
													)}
												</Avatar>
												<div
													className={`flex-1 max-w-[calc(100%-3rem)] md:max-w-[calc(100%-4rem)] p-2 md:p-3 rounded-lg break-words ${
														msg.sender === "user"
															? "bg-gradient-primary text-primary-foreground"
															: "bg-muted"
													}`}
												>
													<div
														className="prose prose-sm max-w-none text-xs md:text-sm leading-relaxed break-words 
    [&_p]:my-2 [&_h3]:my-3 [&_h4]:my-3 [&_ul]:my-2 [&_ol]:my-2 [&_hr]:my-4"
													>
														<ReactMarkdown
															remarkPlugins={[
																remarkMath,
															]}
															rehypePlugins={[
																rehypeKatex,
															]}
														>
															{msg.message}
														</ReactMarkdown>
													</div>
													<p className="text-[10px] md:text-xs opacity-70 mt-1">
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
											<div className="flex gap-2 md:gap-3">
												<Avatar className="h-6 w-6 md:h-8 md:w-8 flex-shrink-0">
													<AvatarImage
														src={
															getCurrentAvatar()
																.image
														}
													/>
													<AvatarFallback className="bg-gradient-primary text-primary-foreground text-xs md:text-sm">
														{
															getCurrentAvatar()
																.name[0]
														}
													</AvatarFallback>
												</Avatar>
												<div className="flex-1 max-w-[calc(100%-3rem)] md:max-w-[calc(100%-4rem)] p-2 md:p-3 rounded-lg bg-muted flex items-center">
													<Loader2 className="h-4 w-4 md:h-5 md:w-5 animate-spin" />
												</div>
											</div>
										)}
										<div ref={messagesEndRef} />
									</div>

									{/* Input Area */}
									<div className="border-t pt-3 md:pt-4 flex-shrink-0">
										<div className="flex gap-2">
											<Textarea
												value={inputText}
												onChange={(e) =>
													setInputText(e.target.value)
												}
												placeholder="Tanyakan tentang materi pembelajaran..."
												className="flex-1 min-h-[36px] md:min-h-[40px] max-h-[100px] md:max-h-[120px] resize-none text-sm md:text-base"
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
											<div className="flex flex-col sm:flex-row items-center gap-2 flex-shrink-0">
												<div className="flex gap-2">
													<Button
														variant="outline"
														size="icon"
														className="h-8 w-8 md:h-10 md:w-10"
														onClick={
															toggleRecording
														}
														disabled={isLoading}
													>
														{isRecording ? (
															<MicOff className="h-3 w-3 md:h-4 md:w-4" />
														) : (
															<Mic className="h-3 w-3 md:h-4 md:w-4" />
														)}
													</Button>
													<Button
														variant="outline"
														size="icon"
														className="h-8 w-8 md:h-10 md:w-10"
														onClick={
															handlePlaybackToggle
														}
														disabled={
															isLoading ||
															!isSupported
														}
													>
														{isSpeaking ? (
															<VolumeX className="h-3 w-3 md:h-4 md:w-4" />
														) : (
															<Volume2 className="h-3 w-3 md:h-4 md:w-4" />
														)}
													</Button>
												</div>
												<Button
													onClick={handleSendMessage}
													disabled={
														!inputText.trim() ||
														isLoading
													}
													className="bg-gradient-primary hover:bg-gradient-primary/90 h-8 w-8 md:h-10 md:w-10"
													size="icon"
												>
													{isLoading ? (
														<Loader2 className="h-3 w-3 md:h-4 md:w-4 animate-spin" />
													) : (
														<Send className="h-3 w-3 md:h-4 md:w-4" />
													)}
												</Button>
											</div>
										</div>
									</div>
								</CardContent>
							</Card>
						</div>
					) : (
						<div className="flex flex-col items-center justify-center h-full px-4">
							<h2 className="text-xl md:text-2xl font-semibold text-muted-foreground text-center">
								Pilih atau buat percakapan baru
							</h2>
							<p className="text-muted-foreground text-sm md:text-base text-center mt-2">
								Mulai belajar dengan asisten AI Anda.
							</p>
							<Button
								className="mt-4 text-sm md:text-base"
								onClick={() => setIsAvatarSelectorOpen(true)}
							>
								<PlusCircle className="mr-2 h-3 w-3 md:h-4 md:w-4" />{" "}
								Mulai Percakapan
							</Button>
						</div>
					)}
				</div>
			</div>
		</div>
	);
};

export default AIAssistant;
