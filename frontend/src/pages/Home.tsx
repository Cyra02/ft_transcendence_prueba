import { useState, useEffect, useCallback, useRef } from "react";
import { io, Socket } from "socket.io-client";
import TicTacToe from "../components/TicTacToe";

const API = "/api";

const COUNTRIES = [
    "Afghanistan","Albania","Algeria","Andorra","Angola","Argentina","Armenia","Australia",
    "Austria","Azerbaijan","Bahamas","Bahrain","Bangladesh","Belarus","Belgium","Belize",
    "Benin","Bolivia","Bosnia and Herzegovina","Botswana","Brazil","Brunei","Bulgaria",
    "Burkina Faso","Burundi","Cambodia","Cameroon","Canada","Chad","Chile","China",
    "Colombia","Congo","Costa Rica","Croatia","Cuba","Cyprus","Czech Republic","Denmark",
    "Dominican Republic","Ecuador","Egypt","El Salvador","Estonia","Ethiopia","Finland",
    "France","Georgia","Germany","Ghana","Greece","Guatemala","Honduras","Hungary",
    "Iceland","India","Indonesia","Iran","Iraq","Ireland","Israel","Italy","Jamaica",
    "Japan","Jordan","Kazakhstan","Kenya","Kuwait","Kyrgyzstan","Latvia","Lebanon",
    "Libya","Lithuania","Luxembourg","Malaysia","Mali","Malta","Mexico","Moldova",
    "Monaco","Mongolia","Montenegro","Morocco","Mozambique","Myanmar","Nepal",
    "Netherlands","New Zealand","Nicaragua","Nigeria","North Korea","Norway","Oman",
    "Pakistan","Panama","Paraguay","Peru","Philippines","Poland","Portugal","Qatar",
    "Romania","Russia","Rwanda","Saudi Arabia","Senegal","Serbia","Singapore",
    "Slovakia","Slovenia","Somalia","South Africa","South Korea","Spain","Sri Lanka",
    "Sudan","Sweden","Switzerland","Syria","Taiwan","Tajikistan","Tanzania","Thailand",
    "Tunisia","Turkey","Turkmenistan","Uganda","Ukraine","United Arab Emirates",
    "United Kingdom","United States","Uruguay","Uzbekistan","Venezuela","Vietnam",
    "Yemen","Zambia","Zimbabwe"
];

type View = "home" | "login" | "register" | "lobby" | "game";

interface User { id: number; username: string; }
interface UserProfile {
    id: number; username: string; displayName?: string; country?: string;
    gender?: string; birthDate?: string; wins?: number;
}
interface Player {
    id: number; username: string; token: string;
    email?: string; displayName?: string; country?: string;
    gender?: string; birthDate?: string; wins?: number;
}
interface FriendRequest { id: number; fromUser: User; }

type FriendStatus = "none" | "pending_sent" | "pending_received" | "friends";

export default function Home() {
    const [view, setView]               = useState<View>("home");
    const [player1, setPlayer1]         = useState<Player | null>(null);
    const [player2, setPlayer2]         = useState<User | null>(null);
    const [users, setUsers]             = useState<User[]>([]);
    const [friends, setFriends]         = useState<User[]>([]);
    const [requests, setRequests]       = useState<FriendRequest[]>([]);
    const [friendStatus, setFriendStatus] = useState<Record<number, FriendStatus>>({});
    const [chatWith, setChatWith]       = useState<User | null>(null);
    const [chatMessages, setChatMessages] = useState<Record<number, { fromUserId: number; content: string; sentAt: string }[]>>({});
    const [chatInput, setChatInput]     = useState("");
    const socketRef                     = useRef<Socket | null>(null);
    const [error, setError]             = useState<string | null>(null);
    const [loading, setLoading]         = useState(false);
    const [selectedProfile, setSelectedProfile] = useState<UserProfile | null>(null);

    // ── Invitaciones multijugador ──────────────────────────────────────────────
    const [onlineFriends, setOnlineFriends]       = useState<number[]>([]);
    const [showMultiModal, setShowMultiModal]     = useState(false);
    const [pendingInvitation, setPendingInvitation] = useState<{ fromUserId: number; fromUsername: string } | null>(null);
    const [invitationSent, setInvitationSent]     = useState<number | null>(null);
    const [onlineGameId, setOnlineGameId]           = useState<number | null>(null);
    const [onlineRoomId, setOnlineRoomId]           = useState<string | null>(null);
    const [isOnlineGame, setIsOnlineGame]           = useState(false);

    const [loginEmail, setLoginEmail]       = useState("");
    const [loginPassword, setLoginPassword] = useState("");
    const [regEmail, setRegEmail]           = useState("");
    const [regUsername, setRegUsername]     = useState("");
    const [regPassword, setRegPassword]     = useState("");
    const [regBirthDate, setRegBirthDate]   = useState("");
    const [regCountry, setRegCountry]       = useState("");
    const [regGender, setRegGender]         = useState("");

    // ── Helpers ────────────────────────────────────────────────────────────────
    const authHeader = (token: string) => ({ Authorization: `Bearer ${token}` });

    const fetchUsers = async (token: string) => {
        const res  = await fetch(`${API}/user`, { headers: authHeader(token) });
        const data = await res.json();
        return Array.isArray(data) ? data : [];
    };

    const fetchFriends = useCallback(async (token: string) => {
        const res  = await fetch(`${API}/user/friends`, { headers: authHeader(token) });
        const data = await res.json();
        return Array.isArray(data) ? data : [];
    }, []);

    const fetchRequests = useCallback(async (token: string) => {
        const res  = await fetch(`${API}/user/friends/requests`, { headers: authHeader(token) });
        const data = await res.json();
        return Array.isArray(data) ? data : [];
    }, []);

    const buildStatusMap = useCallback(
        (allUsers: User[], friendList: User[], pendingReqs: FriendRequest[], _myId: number) => {
            const map: Record<number, FriendStatus> = {};
            const friendIds   = new Set(friendList.map(f => f.id));
            const receivedIds = new Set(pendingReqs.map(r => r.fromUser.id));
            allUsers.forEach(u => {
                if (friendIds.has(u.id))        map[u.id] = "friends";
                else if (receivedIds.has(u.id)) map[u.id] = "pending_received";
                else                            map[u.id] = "none";
            });
            return map;
        }, []
    );

    const refreshSocial = useCallback(async (token: string, allUsers: User[], myId: number) => {
        const [friendList, reqs] = await Promise.all([
            fetchFriends(token),
            fetchRequests(token),
        ]);
        setFriends(friendList);
        setRequests(reqs);
        setFriendStatus(buildStatusMap(allUsers, friendList, reqs, myId));
    }, [fetchFriends, fetchRequests, buildStatusMap]);

    // Polling cada 5s
    useEffect(() => {
        if (!player1) return;
        const interval = setInterval(() => {
            refreshSocial(player1.token, users, player1.id);
        }, 5000);
        return () => clearInterval(interval);
    }, [player1, users, refreshSocial]);

    // Pedir amigos online cada vez que cambia la lista de amigos
    useEffect(() => {
        if (!socketRef.current || !socketRef.current.connected || friends.length === 0) return;
        socketRef.current.emit("get_online_friends", {
            friendIds: friends.map(f => f.id),
        });
    }, [friends]);

    // ── Auth ───────────────────────────────────────────────────────────────────
    const handleLogin = async () => {
        setLoading(true); setError(null);
        try {
            const res  = await fetch(`${API}/auth/login`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: loginEmail, password: loginPassword }),
            });
            const data = await res.json();
            if (data.statusCode) throw new Error(data.message);

            const me = await (await fetch(`${API}/user/me`, { headers: authHeader(data.access_token) })).json();
            const p1: Player = {
                id: me.id, username: me.username, token: data.access_token,
                email: me.email, displayName: me.displayName, country: me.country,
                gender: me.gender, birthDate: me.birthDate, wins: me.wins,
            };
            setPlayer1(p1);

            const all = (await fetchUsers(data.access_token)).filter((u: User) => u.id !== me.id);
            setUsers(all);
            await refreshSocial(data.access_token, all, me.id);
            setView("lobby");
        } catch (e: any) { setError(e.message || "Error al iniciar sesión"); }
        setLoading(false);
    };

    const handleRegister = async () => {
        setLoading(true); setError(null);
        try {
            const res  = await fetch(`${API}/auth/register`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    email: regEmail, username: regUsername, password: regPassword,
                    birthDate: regBirthDate || undefined, country: regCountry || undefined,
                    gender: regGender || undefined,
                }),
            });
            const data = await res.json();
            if (data.statusCode) throw new Error(data.message);

            const me = await (await fetch(`${API}/user/me`, { headers: authHeader(data.access_token) })).json();
            const p1: Player = {
                id: me.id, username: me.username, token: data.access_token,
                email: me.email, displayName: me.displayName, country: me.country,
                gender: me.gender, birthDate: me.birthDate, wins: me.wins,
            };
            setPlayer1(p1);

            const all = (await fetchUsers(data.access_token)).filter((u: User) => u.id !== me.id);
            setUsers(all);
            await refreshSocial(data.access_token, all, me.id);
            setView("lobby");
        } catch (e: any) { setError(e.message || "Error al registrarse"); }
        setLoading(false);
    };

    // ── Acciones de amistad ────────────────────────────────────────────────────
    const sendRequest = async (toUserId: number) => {
        if (!player1) return;
        await fetch(`${API}/user/friends/request/${toUserId}`, {
            method: "POST", headers: authHeader(player1.token),
        });
        setFriendStatus(prev => ({ ...prev, [toUserId]: "pending_sent" }));
    };

    const acceptRequest = async (fromUserId: number) => {
        if (!player1) return;
        await fetch(`${API}/user/friends/accept/${fromUserId}`, {
            method: "POST", headers: authHeader(player1.token),
        });
        await refreshSocial(player1.token, users, player1.id);
    };

    const removeFriend = async (otherUserId: number) => {
        if (!player1) return;
        await fetch(`${API}/user/friends/${otherUserId}`, {
            method: "DELETE", headers: authHeader(player1.token),
        });
        await refreshSocial(player1.token, users, player1.id);
    };

    const sendChat = (toUser: User) => {
        if (!player1 || !chatInput.trim() || !socketRef.current) return;
        socketRef.current.emit("directMessage", {
            fromUserId: player1.id,
            toUserId: toUser.id,
            content: chatInput.trim(),
        });
        setChatInput("");
    };

    const loadProfile = async (userId: number) => {
        if (!player1) return;
        const res  = await fetch(`${API}/user/${userId}`, { headers: authHeader(player1.token) });
        const data = await res.json();
        setSelectedProfile(data);
    };

    // ── Invitaciones ───────────────────────────────────────────────────────────
    const sendInvitation = (toUser: User) => {
        if (!socketRef.current || !player1) return;
        socketRef.current.emit("send_invitation", {
            toUserId: toUser.id,
            fromUsername: player1.username,
        });
        setInvitationSent(toUser.id);
        setShowMultiModal(false);
    };

    const acceptInvitation = () => {
        if (!socketRef.current || !pendingInvitation) return;
        socketRef.current.emit("accept_invitation", {
            fromUserId: pendingInvitation.fromUserId,
            fromUsername: pendingInvitation.fromUsername,
        });
        setPendingInvitation(null);
    };

    const rejectInvitation = () => {
        if (!socketRef.current || !pendingInvitation) return;
        socketRef.current.emit("reject_invitation", {
            fromUserId: pendingInvitation.fromUserId,
        });
        setPendingInvitation(null);
    };

    // ── Socket.io setup ───────────────────────────────────────────────────────
    useEffect(() => {
        if (!player1) return;

        const socket = io("/", {
            path: "/socket.io",
            transports: ["websocket", "polling"],
            auth: { token: player1.token },
            secure: true,
        });
        socketRef.current = socket;

        socket.on("connect", () => {
            socket.emit("register", { userId: player1.id });
            socket.emit("get_online_friends", {
                friendIds: friends.map(f => f.id),
            });
        });

        // Presencia
        socket.on("user_connected", ({ userId }: { userId: number }) => {
            if (friends.some(f => f.id === userId)) {
                setOnlineFriends(prev => [...new Set([...prev, userId])]);
            }
        });

        socket.on("user_disconnected", ({ userId }: { userId: number }) => {
            setOnlineFriends(prev => prev.filter(id => id !== userId));
        });

        socket.on("online_friends", ({ onlineIds }: { onlineIds: number[] }) => {
            setOnlineFriends(onlineIds);
        });

        // Mensajes directos
        socket.on("directMessage", (msg: { fromUserId: number; toUserId: number; content: string; sentAt: string }) => {
            const peerId = msg.fromUserId === player1.id ? msg.toUserId : msg.fromUserId;
            setChatMessages(prev => ({
                ...prev,
                [peerId]: [...(prev[peerId] || []), msg],
            }));
        });

        // Invitaciones
        socket.on("invitation_received", (data: { fromUserId: number; fromUsername: string }) => {
            setPendingInvitation(data);
        });

        socket.on("invitation_error", ({ message }: { message: string }) => {
            setInvitationSent(null);
            setError(message);
        });

        socket.on("invitation_rejected", () => {
            setInvitationSent(null);
            setError("El jugador rechazó la invitación");
        });

        socket.on("game_start", (data: { roomId: string; gameId: number; player1Id: number; player2Id: number }) => {
            setPendingInvitation(null);
            setInvitationSent(null);
            setShowMultiModal(false);
            const opponentId = data.player1Id === player1.id ? data.player2Id : data.player1Id;
            const opponent =
                users.find(u => u.id === opponentId) ??
                friends.find(f => f.id === opponentId);
            if (opponent) {
                setOnlineGameId(data.gameId);
                setOnlineRoomId(data.roomId);
                setIsOnlineGame(true);
                setPlayer2(opponent);
            }
        });

        return () => { socket.disconnect(); socketRef.current = null; };
    }, [player1]);

    // Historial de chat
    useEffect(() => {
        if (!chatWith || !player1 || !socketRef.current) return;
        socketRef.current.emit("getDirectHistory", { userId1: player1.id, userId2: chatWith.id });
        const handler = (history: { authorId: number; content: string; sentAt: string }[]) => {
            const normalized = history.map(m => ({
                fromUserId: m.authorId,
                toUserId: m.authorId === player1.id ? chatWith.id : player1.id,
                content: m.content,
                sentAt: m.sentAt,
            }));
            setChatMessages(prev => ({ ...prev, [chatWith.id]: normalized }));
        };
        socketRef.current.once("directHistory", handler);
        return () => { socketRef.current?.off("directHistory", handler); };
    }, [chatWith, player1]);

    const startGame     = (opponent: User) => { setPlayer2(opponent); };

    const startLocalGame = async () => {
        if (!player1) return;
        const res   = await fetch(`${API}/user/guest`, { headers: authHeader(player1.token) });
        const guest = await res.json();
        if (guest?.id) setPlayer2(guest);
    };

    // ── LOBBY ──────────────────────────────────────────────────────────────────
    if (view === "lobby" && player1) {
        const profileData = selectedProfile ?? player1;

        return (
            <div style={{ display: "flex", flexDirection: "column", width: "100vw", height: "100vh",
                background: "#0f0f0f", fontFamily: "'Courier New', monospace",
                boxSizing: "border-box", padding: 20, gap: 16 }}>

                {/* Fila principal */}
                <div style={{ display: "flex", flex: 1, gap: 16, minHeight: 0 }}>

                    {/* Columna izquierda: Perfil */}
                    <div style={{ flex: "0 0 24%", background: "#1a1a1a", border: "1px solid #2a2a2a",
                        borderRadius: 8, padding: 24, display: "flex", flexDirection: "column" }}>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 12, marginBottom: 24 }}>
                            <div style={{ width: 64, height: 64, background: "#2a2a2a", borderRadius: "50%",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                fontSize: 26, color: "#fff", fontWeight: "bold" }}>
                                {profileData.username[0].toUpperCase()}
                            </div>
                            <div>
                                <p style={{ margin: 0, fontSize: 15, fontWeight: "bold", letterSpacing: 1,
                                    color: selectedProfile ? "#4ecdc4" : "#fff" }}>
                                    {profileData.displayName || profileData.username}
                                </p>
                                <p style={{ margin: 0, fontSize: 11, color: "#555", letterSpacing: 1 }}>
                                    @{profileData.username}
                                </p>
                            </div>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                            {selectedProfile ? (
                                [
                                    ["VICTORIAS", <span style={{ color: "#4ecdc4", fontWeight: 700 }}>{selectedProfile.wins ?? 0}</span>],
                                    ["PAÍS",      selectedProfile.country || "—"],
                                    ["GÉNERO",    selectedProfile.gender || "—"],
                                    ["CUMPLEAÑOS", selectedProfile.birthDate ? new Date(selectedProfile.birthDate).toLocaleDateString() : "—"],
                                ].map(([label, value]) => (
                                    <div key={label as string}>
                                        <p style={s.profileLabel}>{label}</p>
                                        <p style={{ ...s.profileValue, margin: 0 }}>{value}</p>
                                    </div>
                                ))
                            ) : (
                                [
                                    ["VICTORIAS", <span style={{ color: "#4ecdc4", fontWeight: 700 }}>{player1.wins ?? 0}</span>],
                                    ["EMAIL",     player1.email || "—"],
                                    ["PAÍS",      player1.country || "—"],
                                    ["GÉNERO",    player1.gender || "—"],
                                    ["CUMPLEAÑOS", player1.birthDate ? new Date(player1.birthDate).toLocaleDateString() : "—"],
                                ].map(([label, value]) => (
                                    <div key={label as string}>
                                        <p style={s.profileLabel}>{label}</p>
                                        <p style={{ ...s.profileValue, margin: 0 }}>{value}</p>
                                    </div>
                                ))
                            )}
                        </div>
                        <div style={{ marginTop: "auto", paddingTop: 24, display: "flex", flexDirection: "column", gap: 4 }}>
                            {selectedProfile ? (
                                <button style={s.btnLink} onClick={() => setSelectedProfile(null)}>
                                    ← Mi perfil
                                </button>
                            ) : (
                                <button style={s.btnLink}
                                    onClick={() => { setView("home"); setPlayer1(null); setUsers([]); setFriends([]); setRequests([]); }}>
                                    ← Cerrar sesión
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Columna centro: Juego o menú */}
                    <div style={{ flex: "1 1 auto", background: "#1a1a1a", border: "1px solid #2a2a2a",
                        borderRadius: 8, padding: 32, display: "flex", flexDirection: "column",
                        alignItems: "center", justifyContent: "center", gap: 16 }}>
                        {player2 ? (
                            <TicTacToe
                                player1={player1}
                                player2={player2}
                                onExit={() => { setPlayer2(null); setIsOnlineGame(false); setOnlineGameId(null); setOnlineRoomId(null); }}
                                isOnline={isOnlineGame}
                                roomId={onlineRoomId ?? undefined}
                                gameId={onlineGameId ?? undefined}
                                myId={player1.id}
                                socket={socketRef.current}
                            />
                        ) : (
                            <>
                                <p style={{ color: "#aaa", fontSize: 13, letterSpacing: 2, marginBottom: 8 }}>MODO DE JUEGO</p>
                                <button style={{ ...s.btn, ...s.btnSecondary, maxWidth: 280 }} onClick={startLocalGame}>
                                    JUEGO LOCAL
                                </button>
                                <button style={{ ...s.btn, ...s.btnSecondary, maxWidth: 280 }}>
                                    JUEGO vs IA
                                </button>
                                <button
                                    style={{ ...s.btn, ...s.btnSecondary, maxWidth: 280 }}
                                    onClick={() => setShowMultiModal(true)}
                                >
                                    MULTIJUGADOR
                                </button>
                                {invitationSent && (
                                    <p style={{ color: "#555", fontSize: 11, letterSpacing: 1 }}>
                                        Esperando respuesta...
                                    </p>
                                )}
                                <p style={{ color: "#333", fontSize: 11, marginTop: 8 }}>
                                    Elige un amigo de la lista para jugar
                                </p>
                            </>
                        )}
                    </div>

                    {/* Columna derecha: Listas */}
                    <div style={{ flex: "0 0 24%", display: "flex", flexDirection: "column", gap: 16 }}>

                        {/* Lista de jugadores */}
                        <div style={{ flex: 1, background: "#1a1a1a", border: "1px solid #2a2a2a",
                            borderRadius: 8, padding: 16, display: "flex", flexDirection: "column", minHeight: 0 }}>
                            <p style={{ ...s.profileLabel, marginBottom: 10 }}>LISTA DE JUGADORES</p>
                            <div style={{ flex: 1, overflowY: "auto" }}>
                                {users.length === 0
                                    ? <p style={{ color: "#444", fontSize: 12 }}>Sin jugadores online.</p>
                                    : users.map(u => {
                                        const status = friendStatus[u.id] ?? "none";
                                        return (
                                            <div key={u.id} style={{ display: "flex", alignItems: "center",
                                                justifyContent: "space-between", padding: "6px 0",
                                                borderBottom: "1px solid #222" }}>
                                                <span
                                                    style={{ color: "#aaa", fontSize: 12, letterSpacing: 1, cursor: "pointer" }}
                                                    onClick={() => loadProfile(u.id)}
                                                >
                                                    {status === "friends" && <span style={{ color: "#4ecdc4", marginRight: 6 }}>♥</span>}
                                                    {u.username}
                                                </span>
                                                <div style={{ display: "flex", gap: 4 }}>
                                                    {status === "none" && (
                                                        <button style={s.btnSmall} onClick={() => sendRequest(u.id)} title="Enviar petición">+</button>
                                                    )}
                                                    {status === "pending_sent" && (
                                                        <span style={{ fontSize: 10, color: "#555", letterSpacing: 1 }}>ENVIADO</span>
                                                    )}
                                                    {status === "pending_received" && (
                                                        <>
                                                            <button style={{ ...s.btnSmall, background: "#1a3a1a", color: "#4caf50", borderColor: "#2a4a2a" }}
                                                                onClick={() => acceptRequest(u.id)} title="Aceptar">✓</button>
                                                            <button style={{ ...s.btnSmall, background: "#3a1a1a", color: "#ff6666", borderColor: "#4a2a2a" }}
                                                                onClick={() => removeFriend(u.id)} title="Rechazar">✕</button>
                                                        </>
                                                    )}
                                                    {status === "friends" && (
                                                        <button style={{ ...s.btnSmall, color: "#555", borderColor: "#333" }}
                                                            onClick={() => startGame(u)} title="Jugar">▶</button>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })
                                }
                            </div>
                        </div>

                        {/* Lista de amigos */}
                        <div style={{ flex: 1, background: "#1a1a1a", border: "1px solid #2a2a2a",
                            borderRadius: 8, padding: 16, display: "flex", flexDirection: "column", minHeight: 0 }}>
                            <p style={{ ...s.profileLabel, marginBottom: 10 }}>LISTA DE AMIGOS</p>
                            {requests.length > 0 && (
                                <div style={{ marginBottom: 10 }}>
                                    <p style={{ ...s.profileLabel, color: "#ff9944", marginBottom: 6 }}>PETICIONES ({requests.length})</p>
                                    {requests.map(r => (
                                        <div key={r.id} style={{ display: "flex", alignItems: "center",
                                            justifyContent: "space-between", padding: "4px 0" }}>
                                            <span
                                                style={{ color: "#aaa", fontSize: 12, cursor: "pointer" }}
                                                onClick={() => loadProfile(r.fromUser.id)}
                                            >
                                                {r.fromUser.username}
                                            </span>
                                            <div style={{ display: "flex", gap: 4 }}>
                                                <button style={{ ...s.btnSmall, background: "#1a3a1a", color: "#4caf50", borderColor: "#2a4a2a" }}
                                                    onClick={() => acceptRequest(r.fromUser.id)}>✓</button>
                                                <button style={{ ...s.btnSmall, background: "#3a1a1a", color: "#ff6666", borderColor: "#4a2a2a" }}
                                                    onClick={() => removeFriend(r.fromUser.id)}>✕</button>
                                            </div>
                                        </div>
                                    ))}
                                    <div style={{ borderBottom: "1px solid #2a2a2a", margin: "8px 0" }} />
                                </div>
                            )}
                            <div style={{ flex: 1, overflowY: "auto" }}>
                                {friends.length === 0
                                    ? <p style={{ color: "#444", fontSize: 12 }}>Sin amigos aún.</p>
                                    : friends.map(f => (
                                        <div key={f.id} style={{ display: "flex", alignItems: "center",
                                            justifyContent: "space-between", padding: "6px 0",
                                            borderBottom: "1px solid #222" }}>
                                            <span
                                                style={{ color: "#4ecdc4", fontSize: 12, letterSpacing: 1, cursor: "pointer" }}
                                                onClick={() => loadProfile(f.id)}
                                            >
                                                {onlineFriends.includes(f.id)
                                                    ? <span style={{ color: "#4caf50", marginRight: 6 }}>●</span>
                                                    : <span style={{ color: "#333", marginRight: 6 }}>●</span>
                                                }
                                                ♥ {f.username}
                                            </span>
                                            <div style={{ display: "flex", gap: 4 }}>
                                                <button style={{ ...s.btnSmall }} onClick={() => startGame(f)} title="Jugar">▶</button>
                                                <button style={{ ...s.btnSmall, color: "#4ecdc4", borderColor: "#2a4a4a" }}
                                                    onClick={() => setChatWith(f)} title="Chat">✉</button>
                                                <button style={{ ...s.btnSmall, color: "#555", borderColor: "#333" }}
                                                    onClick={() => removeFriend(f.id)} title="Eliminar">✕</button>
                                            </div>
                                        </div>
                                    ))
                                }
                            </div>
                        </div>

                    </div>
                </div>

                {/* Barra inferior */}
                <div style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 8,
                    padding: "16px 32px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <h1 style={{ margin: 0, fontSize: 22, fontWeight: "bold", letterSpacing: 6, color: "#fff" }}>
                        FT TRANSCENDENCE
                    </h1>
                </div>

                {/* Chat flotante */}
                {chatWith && (
                    <div style={{ position: "fixed", bottom: 24, right: 24, width: 300,
                        background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 8,
                        boxShadow: "0 0 30px rgba(0,0,0,0.8)", display: "flex", flexDirection: "column",
                        fontFamily: "'Courier New', monospace", zIndex: 1000 }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                            padding: "10px 14px", borderBottom: "1px solid #2a2a2a" }}>
                            <span style={{ color: "#4ecdc4", fontSize: 12, letterSpacing: 2 }}>
                                ♥ {chatWith.username.toUpperCase()}
                            </span>
                            <button style={{ ...s.btnSmall, color: "#555", borderColor: "#333", fontSize: 13 }}
                                onClick={() => setChatWith(null)}>✕</button>
                        </div>
                        <div style={{ height: 200, overflowY: "auto", padding: "10px 14px",
                            display: "flex", flexDirection: "column", gap: 6 }}>
                            {(chatMessages[chatWith.id] || []).length === 0
                                ? <p style={{ color: "#444", fontSize: 11, textAlign: "center", marginTop: 80 }}>
                                    Sin mensajes aún
                                </p>
                                : (chatMessages[chatWith.id] || []).map((m, i) => (
                                    <div key={i} style={{ display: "flex",
                                        justifyContent: m.fromUserId === player1!.id ? "flex-end" : "flex-start" }}>
                                        <span style={{
                                            background: m.fromUserId === player1!.id ? "#2a2a4a" : "#2a2a2a",
                                            color: m.fromUserId === player1!.id ? "#aaaaff" : "#aaa",
                                            borderRadius: 4, padding: "4px 8px", fontSize: 12, maxWidth: "75%",
                                            wordBreak: "break-word",
                                        }}>{m.content}</span>
                                    </div>
                                ))
                            }
                        </div>
                        <div style={{ display: "flex", borderTop: "1px solid #2a2a2a" }}>
                            <input
                                style={{ flex: 1, background: "transparent", border: "none", outline: "none",
                                    color: "#fff", fontFamily: "'Courier New', monospace", fontSize: 12,
                                    padding: "8px 12px" }}
                                placeholder="Escribe un mensaje..."
                                value={chatInput}
                                onChange={e => setChatInput(e.target.value)}
                                onKeyDown={e => e.key === "Enter" && sendChat(chatWith)}
                            />
                            <button
                                style={{ ...s.btnSmall, margin: 6, color: "#4ecdc4", borderColor: "#2a4a4a" }}
                                onClick={() => sendChat(chatWith)}>▶</button>
                        </div>
                    </div>
                )}

                {/* Modal multijugador */}
                {showMultiModal && (
                    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)",
                        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000 }}>
                        <div style={{ background: "#1a1a1a", border: "1px solid #2a2a2a",
                            borderRadius: 8, padding: 32, width: 320,
                            fontFamily: "'Courier New', monospace" }}>
                            <p style={{ ...s.profileLabel, marginBottom: 16, fontSize: 12 }}>
                                AMIGOS CONECTADOS
                            </p>
                            {friends.filter(f => onlineFriends.includes(f.id)).length === 0 ? (
                                <p style={{ color: "#444", fontSize: 12 }}>
                                    Ningún amigo conectado ahora mismo.
                                </p>
                            ) : (
                                friends
                                    .filter(f => onlineFriends.includes(f.id))
                                    .map(f => (
                                        <div key={f.id} style={{ display: "flex", alignItems: "center",
                                            justifyContent: "space-between", padding: "8px 0",
                                            borderBottom: "1px solid #222" }}>
                                            <span style={{ color: "#4ecdc4", fontSize: 12, letterSpacing: 1 }}>
                                                ● {f.username}
                                            </span>
                                            <button
                                                style={{ ...s.btnSmall, color: "#fff", borderColor: "#444" }}
                                                onClick={() => sendInvitation(f)}
                                            >
                                                Invitar
                                            </button>
                                        </div>
                                    ))
                            )}
                            <button
                                style={{ ...s.btnLink, marginTop: 16 }}
                                onClick={() => setShowMultiModal(false)}
                            >
                                ← Cancelar
                            </button>
                        </div>
                    </div>
                )}

                {/* Notificación de invitación recibida */}
                {pendingInvitation && (
                    <div style={{ position: "fixed", top: 24, right: 24, width: 300,
                        background: "#1a1a1a", border: "1px solid #4ecdc4",
                        borderRadius: 8, padding: 20, zIndex: 2000,
                        fontFamily: "'Courier New', monospace",
                        boxShadow: "0 0 30px rgba(78,205,196,0.2)" }}>
                        <p style={{ color: "#4ecdc4", fontSize: 12, letterSpacing: 2, margin: "0 0 8px 0" }}>
                            INVITACIÓN RECIBIDA
                        </p>
                        <p style={{ color: "#aaa", fontSize: 12, margin: "0 0 16px 0" }}>
                            <strong style={{ color: "#fff" }}>{pendingInvitation.fromUsername}</strong> te ha invitado a jugar
                        </p>
                        <div style={{ display: "flex", gap: 8 }}>
                            <button
                                style={{ ...s.btn, ...s.btnPrimary, marginTop: 0, flex: 1, padding: "8px" }}
                                onClick={acceptInvitation}
                            >
                                ACEPTAR
                            </button>
                            <button
                                style={{ ...s.btn, ...s.btnSecondary, marginTop: 0, flex: 1, padding: "8px" }}
                                onClick={rejectInvitation}
                            >
                                RECHAZAR
                            </button>
                        </div>
                    </div>
                )}

            </div>
        );
    }

    // ── HOME / LOGIN / REGISTER ────────────────────────────────────────────────
    return (
        <div style={s.wrapper}>
            <div style={s.card}>
                <h1 style={s.title}>FT TRANSCENDENCE</h1>
                <p style={s.subtitle}>Tic Tac Toe</p>

                {view === "home" && (
                    <div style={s.btnGroup}>
                        <button style={{ ...s.btn, ...s.btnPrimary }} onClick={() => { setView("login"); setError(null); }}>Sign In</button>
                        <button style={{ ...s.btn, ...s.btnSecondary }} onClick={() => { setView("register"); setError(null); }}>Sign Up</button>
                    </div>
                )}

                {view === "login" && (
                    <div style={s.form}>
                        <p style={s.formTitle}>Iniciar sesión</p>
                        {error && <div style={s.error}>{error}</div>}
                        <label style={s.label}>EMAIL</label>
                        <input style={s.input} type="email" value={loginEmail}
                            onChange={e => setLoginEmail(e.target.value)}
                            onKeyDown={e => e.key === "Enter" && handleLogin()}
                            placeholder="tu@email.com" />
                        <label style={s.label}>CONTRASEÑA</label>
                        <input style={s.input} type="password" value={loginPassword}
                            onChange={e => setLoginPassword(e.target.value)}
                            onKeyDown={e => e.key === "Enter" && handleLogin()}
                            placeholder="••••••" />
                        <button style={{ ...s.btn, ...s.btnPrimary }} onClick={handleLogin} disabled={loading}>
                            {loading ? "Entrando..." : "Entrar"}
                        </button>
                        <button style={s.btnLink} onClick={() => { setView("home"); setError(null); }}>← Volver</button>
                    </div>
                )}

                {view === "register" && (
                    <div style={s.form}>
                        <p style={s.formTitle}>Crear cuenta</p>
                        {error && <div style={s.error}>{error}</div>}
                        <label style={s.label}>EMAIL *</label>
                        <input style={s.input} type="email" value={regEmail} onChange={e => setRegEmail(e.target.value)} placeholder="tu@email.com" />
                        <label style={s.label}>USERNAME *</label>
                        <input style={s.input} type="text" value={regUsername} onChange={e => setRegUsername(e.target.value)} placeholder="tunombre" />
                        <label style={s.label}>CONTRASEÑA *</label>
                        <input style={s.input} type="password" value={regPassword} onChange={e => setRegPassword(e.target.value)} placeholder="••••••" />
                        <label style={s.label}>FECHA DE NACIMIENTO</label>
                        <input style={s.input} type="date" value={regBirthDate} onChange={e => setRegBirthDate(e.target.value)} />
                        <label style={s.label}>PAÍS</label>
                        <select style={s.input} value={regCountry} onChange={e => setRegCountry(e.target.value)}>
                            <option value="">— Selecciona un país —</option>
                            {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                        <label style={s.label}>GÉNERO</label>
                        <select style={s.input} value={regGender} onChange={e => setRegGender(e.target.value)}>
                            <option value="">— Selecciona —</option>
                            <option value="male">Hombre</option>
                            <option value="female">Mujer</option>
                            <option value="nb">No binario</option>
                        </select>
                        <button style={{ ...s.btn, ...s.btnPrimary }} onClick={handleRegister} disabled={loading}>
                            {loading ? "Registrando..." : "Crear cuenta"}
                        </button>
                        <button style={s.btnLink} onClick={() => { setView("home"); setError(null); }}>← Volver</button>
                    </div>
                )}
            </div>
        </div>
    );
}

const s: Record<string, any> = {
    wrapper: { display: "flex", justifyContent: "center", alignItems: "center",
        minHeight: "100vh", background: "#0f0f0f", fontFamily: "'Courier New', monospace" },
    card: { background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: "4px",
        padding: "40px 32px", width: "360px", boxShadow: "0 0 60px rgba(0,0,0,0.8)",
        maxHeight: "90vh", overflowY: "auto" as const },
    title: { fontSize: "20px", fontWeight: "bold", letterSpacing: "4px", color: "#fff",
        margin: "0 0 4px 0", textAlign: "center" as const },
    subtitle: { fontSize: "11px", color: "#555", letterSpacing: "3px", textAlign: "center" as const,
        margin: "0 0 32px 0", textTransform: "uppercase" as const },
    btnGroup: { display: "flex", flexDirection: "column" as const, gap: "10px" },
    btn: { width: "100%", padding: "12px", fontSize: "12px", fontFamily: "'Courier New', monospace",
        letterSpacing: "3px", border: "none", borderRadius: "2px", cursor: "pointer",
        fontWeight: "bold", marginTop: "8px" },
    btnPrimary:   { background: "#fff", color: "#000" },
    btnSecondary: { background: "#1e1e1e", color: "#aaa", border: "1px solid #333" },
    btnLink: { background: "transparent", border: "none", color: "#555", fontSize: "12px",
        fontFamily: "'Courier New', monospace", cursor: "pointer", letterSpacing: "1px",
        padding: "8px 0", width: "100%" },
    btnSmall: { background: "#111", border: "1px solid #2a2a2a", borderRadius: "2px",
        color: "#aaa", fontFamily: "'Courier New', monospace", fontSize: "11px",
        cursor: "pointer", padding: "2px 7px", lineHeight: "1.4" },
    form:      { display: "flex", flexDirection: "column" as const, gap: "4px" },
    formTitle: { fontSize: "13px", color: "#aaa", letterSpacing: "2px",
        textTransform: "uppercase" as const, marginBottom: "12px" },
    label: { fontSize: "10px", letterSpacing: "2px", color: "#555", marginTop: "8px" },
    input: { padding: "9px 12px", background: "#111", border: "1px solid #2a2a2a",
        borderRadius: "2px", color: "#fff", fontFamily: "'Courier New', monospace",
        fontSize: "13px", outline: "none", width: "100%", boxSizing: "border-box" as const },
    error: { background: "#2a1515", border: "1px solid #ff4444", borderRadius: "2px",
        padding: "8px 12px", fontSize: "12px", color: "#ff6666", marginBottom: "8px", letterSpacing: "1px" },
    profileLabel: { fontSize: "10px", color: "#444", letterSpacing: "2px",
        margin: "0 0 2px 0", textTransform: "uppercase" as const },
    profileValue: { fontSize: "12px", color: "#aaa", letterSpacing: "1px" },
};