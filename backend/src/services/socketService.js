const socketIo = require('socket.io');

let io;

function init(server, corsOptions) {
  io = socketIo(server, { cors: corsOptions });
  
  io.on('connection', (socket) => {
    console.log(`[Socket] Client connected: ${socket.id}`);
    
    // Client can join a specific room for a project or task
    socket.on('join_task', (taskId) => {
      socket.join(`task_${taskId}`);
      console.log(`[Socket] ${socket.id} joined task_${taskId}`);
    });
    
    socket.on('join_global_approvals', () => {
      socket.join('global_approvals');
      console.log(`[Socket] ${socket.id} joined global_approvals`);
    });
    
    socket.on('disconnect', () => {
      console.log(`[Socket] Client disconnected: ${socket.id}`);
    });
  });
  
  return io;
}

function getIo() {
  if (!io) {
    console.warn('[Socket] IO not initialized yet');
  }
  return io;
}

module.exports = {
  init,
  getIo
};
