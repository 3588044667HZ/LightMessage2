// message.js - 独立的消息提示组件
class SimpleMessage {
    constructor() {
        this.container = null;
        this.init();
    }

    init() {
        // 创建消息容器
        this.container = document.createElement('div');
        this.container.className = 'simple-message-container';
        this.container.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 9999;
            display: flex;
            flex-direction: column;
            align-items: flex-end;
        `;
        document.body.appendChild(this.container);
    }

    show(options) {
        const {message, type = 'info', duration = 3000} = options;

        // 创建消息元素
        const messageEl = document.createElement('div');
        messageEl.className = `simple-message simple-message-${type}`;
        messageEl.style.cssText = `
            min-width: 200px;
            max-width: 400px;
            padding: 12px 16px;
            margin-bottom: 10px;
            border-radius: 8px;
            box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
            background-color: #fff;
            border: 1px solid;
            display: flex;
            align-items: center;
            animation: fadeIn 0.3s;
            transition: all 0.3s;
        `;

        // 设置不同消息类型的样式
        const typeStyles = {
            success: {
                borderColor: '#f0f9eb', backgroundColor: '#f0f9eb', color: '#67c23a'
            }, error: {
                borderColor: '#fef0f0', backgroundColor: '#fef0f0', color: '#f56c6c'
            }, warning: {
                borderColor: '#fdf6ec', backgroundColor: '#fdf6ec', color: '#e6a23c'
            }, info: {
                borderColor: '#f4f4f5', backgroundColor: '#f4f4f5', color: '#909399'
            }
        };

        Object.assign(messageEl.style, typeStyles[type] || typeStyles.info);

        // 添加图标
        const iconMap = {
            success: '✓', error: '✗', warning: '!', info: 'i'
        };

        const iconEl = document.createElement('span');
        iconEl.textContent = iconMap[type] || 'i';
        iconEl.style.cssText = `
            margin-right: 10px;
            font-weight: bold;
            font-size: 16px;
        `;

        // 添加消息文本
        const textEl = document.createElement('span');
        textEl.textContent = message;
        textEl.style.cssText = `
            flex: 1;
            font-size: 14px;
            line-height: 1.5;
        `;

        // 添加关闭按钮
        const closeEl = document.createElement('span');
        closeEl.textContent = '×';
        closeEl.style.cssText = `
            margin-left: 10px;
            cursor: pointer;
            font-size: 18px;
            font-weight: bold;
        `;
        closeEl.onclick = () => this.closeMessage(messageEl);

        messageEl.appendChild(iconEl);
        messageEl.appendChild(textEl);
        messageEl.appendChild(closeEl);
        this.container.appendChild(messageEl);

        // 自动关闭
        if (duration > 0) {
            setTimeout(() => this.closeMessage(messageEl), duration);
        }

        return messageEl;
    }

    closeMessage(messageEl) {
        messageEl.style.opacity = '0';
        messageEl.style.transform = 'translateX(100%)';
        setTimeout(() => {
            if (messageEl.parentNode) {
                messageEl.parentNode.removeChild(messageEl);
            }
        }, 300);
    }

    success(message, duration = 3000) {
        return this.show({message, type: 'success', duration});
    }

    error(message, duration = 3000) {
        return this.show({message, type: 'error', duration});
    }

    warning(message, duration = 3000) {
        return this.show({message, type: 'warning', duration});
    }

    info(message, duration = 3000) {
        return this.show({message, type: 'info', duration});
    }
}

// 全局消息实例
window.SimpleMessage = new SimpleMessage();

// 添加到全局对象
window.Message = {
    success: (message, duration) => window.SimpleMessage.success(message, duration),
    error: (message, duration) => window.SimpleMessage.error(message, duration),
    warning: (message, duration) => window.SimpleMessage.warning(message, duration),
    info: (message, duration) => window.SimpleMessage.info(message, duration)
};

// 添加动画样式
const style = document.createElement('style');
style.textContent = `
    @keyframes fadeIn {
        from {
            opacity: 0;
            transform: translateX(100%);
        }
        to {
            opacity: 1;
            transform: translateX(0);
        }
    }
`;
document.head.appendChild(style);