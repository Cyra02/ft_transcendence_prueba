import { useState, useEffect } from "react";
import { Socket } from "socket.io-client";

const API = "/api";

interface Player { id: number; username: string; token: string; }
interface Opponent { id: number; username: string; }

interface Props {
    player1: Player;
    player2: Opponent;
    onExit: () => void;
    // Props online opcionales
    isOnline?: boolean;
    roomId?: string;
    gameId?: number;
    myId?: number;
    socket?: Socket | null;
}

export default function TicTacToe({
    player1,
    player2,
    onExit,
    isOnline = false,
    roomId,
    gameId: initialGameId,
    myId,
    socket,
}: Props) {
    const [gameId, setGameId]   = useState<number | null>(initialGameId ?? null);
    const [board, setBoard]     = useState("_________");
    const [status, setStatus]   = useState(isOnline ? "playing" : "idle");
    const [winner, setWinner]   = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError]     = useState<string | null>(null);

    const cells    = board.split("");
    const xCount   = cells.filter(c => c === "X").length;
    const oCount   = cells.filter(c => c === "O").length;
    const isP1Turn = xCount === oCount;

    // En online: player1 del juego es quien envió la invitación (myId puede ser p1 o p2)
    const isMyTurn = isOnline
        ? (isP1Turn ? myId === player1.id : myId === player2.id)
        : true; // en local siempre puede mover

    // ── Escuchar eventos online ────────────────────────────────────────────────
    useEffect(() => {
        if (!isOnline || !socket) return;

        socket.on("game_updated", (data: { board: string; status: string; winner: string | null }) => {
            setBoard(data.board);
            setStatus(data.status);
            setWinner(data.winner);
        });

        socket.on("move_error", ({ message }: { message: string }) => {
            setError(message);
        });

        return () => {
            socket.off("game_updated");
            socket.off("move_error");
        };
    }, [isOnline, socket]);

    // ── Crear partida local ────────────────────────────────────────────────────
    const newGame = async () => {
        if (isOnline) return; // online ya tiene partida creada
        setLoading(true);
        setError(null);
        try {
            const r1 = await fetch(`${API}/game`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${player1.token}` },
                body: JSON.stringify({ player1Id: player1.id }),
            });
            const g1 = await r1.json();
            if (g1.statusCode) throw new Error(g1.message);

            const r2 = await fetch(`${API}/game/join`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${player1.token}` },
                body: JSON.stringify({ gameId: g1.id, player2Id: player2.id }),
            });
            const g2 = await r2.json();
            if (g2.statusCode) throw new Error(g2.message);

            setGameId(g2.id);
            setBoard(g2.board);
            setStatus("playing");
            setWinner(null);
        } catch (e: any) {
            setError(e.message || "Error al crear la partida");
        }
        setLoading(false);
    };

    // ── Mover ──────────────────────────────────────────────────────────────────
    const move = async (pos: number) => {
        if (status !== "playing" || cells[pos] !== "_") return;
        if (isOnline && (!isMyTurn || !socket || !roomId || !gameId)) return;

        setError(null);

        if (isOnline) {
            // Enviar movimiento por WebSocket
            socket!.emit("online_move", {
                gameId,
                position: pos,
                roomId,
            });
        } else {
            // Movimiento local via HTTP
            if (!gameId) return;
            const playerId = isP1Turn ? player1.id : player2.id;
            setLoading(true);
            try {
                const res  = await fetch(`${API}/game/${gameId}/move`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", Authorization: `Bearer ${player1.token}` },
                    body: JSON.stringify({ playerId, position: pos }),
                });
                const data = await res.json();
                if (data.statusCode) throw new Error(data.message);
                setBoard(data.board);
                setStatus(data.status);
                setWinner(data.winner);
            } catch (e: any) {
                setError(e.message);
            }
            setLoading(false);
        }
    };

    const winnerLabel =
        winner === "player1" ? `¡Gana ${player1.username} (X)!` :
        winner === "player2" ? `¡Gana ${player2.username} (O)!` :
        winner === "draw"    ? "¡Empate!" : null;

    const turnLabel = isOnline
        ? (isMyTurn ? "Tu turno" : `Turno de ${isP1Turn ? player1.username : player2.username}...`)
        : (isP1Turn ? `Turno: ${player1.username} (X)` : `Turno: ${player2.username} (O)`);

    return (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center",
            padding: "16px", gap: "12px", fontFamily: "monospace", color: "#fff", width: "100%" }}>
            <h2 style={{ letterSpacing: "4px", fontSize: "18px" }}>TIC TAC TOE</h2>

            {isOnline && (
                <span style={{ fontSize: 10, letterSpacing: 2, color: "#4ecdc4", background: "#0a2a2a",
                    padding: "2px 10px", borderRadius: 99 }}>
                    ONLINE
                </span>
            )}

            <div style={{ display: "flex", gap: "24px", fontSize: "13px" }}>
                <span style={{ color: "#ff6b35" }}>X — {player1.username}</span>
                <span style={{ color: "#555" }}>VS</span>
                <span style={{ color: "#4ecdc4" }}>O — {player2.username}</span>
            </div>

            {error && <p style={{ color: "#ff6666", fontSize: "12px" }}>{error}</p>}

            {status === "idle" && (
                <button onClick={newGame} disabled={loading} style={btnStyle}>
                    {loading ? "Creando..." : "Nueva Partida"}
                </button>
            )}

            {status !== "idle" && (
                <>
                    <p style={{ fontSize: "13px", letterSpacing: "1px", color: "#aaa" }}>
                        {winnerLabel ?? turnLabel}
                    </p>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 90px)", gap: "6px" }}>
                        {cells.map((cell, i) => (
                            <button
                                key={i}
                                onClick={() => move(i)}
                                disabled={cell !== "_" || status !== "playing" || loading || (isOnline && !isMyTurn)}
                                style={{
                                    height: "90px",
                                    fontSize: "32px",
                                    fontWeight: "bold",
                                    background: "#1a1a1a",
                                    border: "1px solid #2a2a2a",
                                    borderRadius: "2px",
                                    cursor: cell === "_" && status === "playing" && (!isOnline || isMyTurn) ? "pointer" : "default",
                                    color: cell === "X" ? "#ff6b35" : cell === "O" ? "#4ecdc4" : "#333",
                                    fontFamily: "monospace",
                                }}
                            >
                                {cell === "_" ? "" : cell}
                            </button>
                        ))}
                    </div>

                    <div style={{ display: "flex", gap: "8px" }}>
                        {!isOnline && (
                            <button onClick={newGame} disabled={loading} style={btnStyle}>
                                {loading ? "..." : "Nueva Partida"}
                            </button>
                        )}
                        <button onClick={onExit} style={{ ...btnStyle, background: "#1a1a1a",
                            color: "#666", border: "1px solid #2a2a2a" }}>
                            Volver
                        </button>
                    </div>
                </>
            )}

            {status === "idle" && (
                <button onClick={onExit} style={{ ...btnStyle, background: "transparent",
                    color: "#555", border: "none" }}>
                    ← Volver
                </button>
            )}
        </div>
    );
}

const btnStyle: React.CSSProperties = {
    padding: "10px 20px",
    fontSize: "12px",
    fontFamily: "monospace",
    letterSpacing: "2px",
    background: "#fff",
    color: "#000",
    border: "none",
    borderRadius: "2px",
    cursor: "pointer",
    fontWeight: "bold",
};