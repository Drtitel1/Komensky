import log from "electron-log/main";

log.initialize();
log.transports.file.level = "info";
log.transports.file.maxSize = 2 * 1024 * 1024;
log.transports.console.level = "info";

export default log;
