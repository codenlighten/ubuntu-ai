export const systemActionSchema = {
  type: "object",
  properties: {
    action: {
      type: "string",
      enum: [
        "update_system",
        "install_package",
        "create_user",
        "configure_file",
        "read_file",
        "get_system_stats",
        "browse_web",
        "enable_service",
        "open_port",
        "run_cmd",
        "finish"
      ]
    },
    details: {
      type: "object",
      properties: {
        pkg:      { type: "string" },
        user:     { type: "string" },
        home:     { type: "string" },
        path:     { type: "string" },
        content:  { type: "string" },
        service:  { type: "string" },
        port:     { type: "number" },
        cmd:      { type: "string" },
        url:      { type: "string" }
      }
    }
  },
  required: ["action", "details"]
};
