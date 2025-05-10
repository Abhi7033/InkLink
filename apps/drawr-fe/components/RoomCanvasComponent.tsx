"use client";

import { WS_BACKEND, HTTP_BACKEND } from "@/config";
import { useEffect, useState } from "react";
import { CanvasComponent } from "./CanvasComponent";
import { UserAvatar } from "./AvatarComponent";
import { WSLoader } from "./WSLoader";
import {
  getOrCreateGuestUser,
  GuestUser,
  exportDrawingsFromLocalStorage,
  clearAllGuestData,
} from "@/utils/guestUser";
import axios from "axios";
import { useSearchParams } from "next/navigation";

export function RoomCanvasComponent({
  roomId,
  token,
  isGuestMode = false,
}: {
  roomId: string;
  token?: string;
  isGuestMode?: boolean;
}) {
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const wsUrl = `${WS_BACKEND}?token=${token}`;
  const [roomUsers, setRoomUsers] = useState<string[]>([]);
  const [guestUser, setGuestUser] = useState<GuestUser | null>(null);
  const searchParams = useSearchParams();
  const shouldConvert = searchParams?.get("convert") === "true";
  const [isImporting, setIsImporting] = useState(shouldConvert);


  // Handle drawing import if needed
  useEffect(() => {
    const importDrawings = async () => {
      if (!token || !shouldConvert) {
        setIsImporting(false);
        return;
      }

      try {
        // Get drawings from local storage
        const drawings = exportDrawingsFromLocalStorage();

        if (drawings && drawings.length > 0) {
          // Import drawings to the room
          await axios.post(
            `${HTTP_BACKEND}/import-guest-drawings`,
            {
              roomId,
              drawings,
            },
            { headers: { Authorization: token } }
          );

          // Clear guest data after successful import
          clearAllGuestData();
        } else {
          console.log("No drawings to import");
        }

        setIsImporting(false);
      } catch (error) {
        console.error("Error importing guest drawings:", error);
        setIsImporting(false);
      }
    };

    // Only run the import once when the component mounts
    if (isImporting) {
      importDrawings();
    }
  }, [token, roomId, shouldConvert, isImporting]);

  useEffect(() => {
    if (isGuestMode) {
      // For guest mode, we don't need a real WebSocket connection
      const user = getOrCreateGuestUser();
      setGuestUser(user);
      setRoomUsers([user.username]);
      return;
    }

    if (!token) return;

    console.log("Initializing WebSocket connection");
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      setSocket(ws);
      ws.send(
        JSON.stringify({
          type: "join_room",
          roomId: Number(roomId),
        })
      );
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "room_users") {
        const uniqueUsers = [
          ...new Set((data.users as string[]).filter(Boolean)),
        ];
        setRoomUsers(uniqueUsers);
      }
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
    };

    // Listen for beforeunload event
    const handleBeforeUnload = () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: "leave_room",
            roomId: Number(roomId),
          })
        );
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      ws.close();
    };
  }, [roomId, wsUrl, isGuestMode, token]);

  if (isImporting) {
    return <WSLoader message="Importing your drawings..." />;
  }

  if (!socket && !isGuestMode) {
    return <WSLoader />;
  }

  return (
    <div className="relative">
      <div className="fixed bottom-4 right-4 flex flex-col gap-2 z-10">
        {roomUsers.map((username, index) => (
          <div key={`${username}-${index}`} className="group relative">
            <UserAvatar name={username} size="sm" />
          </div>
        ))}
      </div>
      <CanvasComponent
        roomId={roomId}
        socket={socket}
        isGuestMode={isGuestMode}
        guestUser={isGuestMode ? guestUser : null}
      />
    </div>
  );
}
