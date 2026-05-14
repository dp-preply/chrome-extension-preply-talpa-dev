// The content of this file will be injected into global scope of a page
// when clicking on the extension action icon. That's why we need to
// encapsulate it to make sure it won't conflict with page's scripts
// and can be injected multiple time
(() => {
    class ElementSelector {
        styles = ElementSelector.#constructStyles();
        canvas = ElementSelector.#constructCanvas();

        targetElem: Element | null;
        toggled: boolean;
        cursor: { x: number; y: number };
        detectedLoc: DetectedLoc | null;
        callbackResolve: CallableFunction | null;

        constructor() {
            this.targetElem = null;
            this.toggled = false;
            this.cursor = { x: 0, y: 0 };
            this.callbackResolve = null;
            this.detectedLoc = null;
            this.#initListeners();
        }

        #handleMouseDown = () => {
            const ctx = this.canvas.getContext('2d');
            ctx?.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.canvas.classList.remove('enabled');
            this.toggled = false;
            this.callbackResolve && this.callbackResolve(this.detectedLoc);
        };

        async togglePrompt() {
            this.canvas.classList.add('enabled');

            this.toggled = true;

            return new Promise(resolve => {
                this.callbackResolve = resolve;
                document.addEventListener('mousedown', this.#handleMouseDown);
            });
        }

        destroy() {
            this.toggled = false;
            this.#removeListeners();
            this.styles.remove();
            this.canvas.remove();
        }

        #detectElement() {
            let elem: Element | null = null;
            for (const e of document.elementsFromPoint(this.cursor.x, this.cursor.y)) {
                if (e !== this.canvas) {
                    elem = e;
                    break;
                }
            }

            if (!elem) {
                return;
            }

            this.#changeTargetElem(elem);
            this.#drawSelectionBox(elem);
        }

        #changeTargetElem(elem: Element) {
            if (this.targetElem === elem) {
                return;
            }

            this.detectedLoc = getTransProps(elem);
            this.targetElem = elem;
        }

        #drawSelectionBox(elem: Element) {
            const ctx = this.canvas.getContext('2d');
            if (!ctx) {
                console.error("No getContext('2d') returned");
                return;
            }

            const elemCoords = elem.getBoundingClientRect();

            const topCoord = Math.round(elemCoords.top) + 0.5;
            const rightCoord = Math.round(elemCoords.right) + 0.5;
            const bottomCoord = Math.round(elemCoords.bottom) + 0.5;
            const leftCoord = Math.round(elemCoords.left) + 0.5;

            ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

            ctx.setLineDash([3, 2]);

            if (this.detectedLoc && this.detectedLoc.id) {
                const text = this.detectedLoc.id.substring(0, 100);

                ctx.beginPath();
                const textMetrics = ctx.measureText(text);
                if (topCoord > 30) {
                    ctx.roundRect(
                        leftCoord - 8,
                        topCoord,
                        textMetrics.width + 20,
                        -textMetrics.fontBoundingBoxAscent - 20,
                        5,
                    );
                } else {
                    ctx.roundRect(
                        leftCoord - 8,
                        bottomCoord,
                        textMetrics.width + 20,
                        textMetrics.fontBoundingBoxAscent + 20,
                        5,
                    );
                }
                ctx.fillStyle = 'white';
                ctx.fill();

                ctx.beginPath();
                ctx.font = '1.2rem sans-serif';
                ctx.fillStyle = 'darkolivegreen';
                if (topCoord > 30) {
                    ctx.textAlign = 'start';
                    ctx.textBaseline = 'bottom';
                    ctx.fillText(text, leftCoord, topCoord - 10);
                } else {
                    ctx.textAlign = 'start';
                    ctx.textBaseline = 'top';
                    ctx.fillText(text, leftCoord, bottomCoord + 10);
                }

                ctx.fillStyle = '#06756041';
            } else {
                ctx.fillStyle = '#a3120a41';
            }
            ctx.fillRect(leftCoord, topCoord, rightCoord - leftCoord, bottomCoord - topCoord);

            ctx.strokeStyle = '#7508cb';

            ctx.beginPath();
            ctx.moveTo(leftCoord, topCoord);
            ctx.lineTo(rightCoord, topCoord);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(leftCoord, bottomCoord);
            ctx.lineTo(rightCoord, bottomCoord);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(leftCoord, topCoord);
            ctx.lineTo(leftCoord, bottomCoord);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(rightCoord, topCoord);
            ctx.lineTo(rightCoord, bottomCoord);
            ctx.stroke();
        }

        #updateCanvas() {
            const canvas = this.canvas;
            canvas.setAttribute('width', canvas.clientWidth.toString());
            canvas.setAttribute('height', canvas.clientHeight.toString());
        }

        #handleMousemove = (e: MouseEvent) => {
            this.cursor = { x: e.clientX, y: e.clientY };

            if (this.toggled) {
                this.#detectElement();
            }
        };

        #handleScroll = () => {
            if (this.toggled) {
                this.#detectElement();
            }
        };

        #handleMouseout = () => {
            if (this.toggled) {
                this.canvas.classList.remove('enabled');
            }
        };

        #handleMouseover = () => {
            if (this.toggled) {
                this.canvas.classList.add('enabled');
            }
        };

        #handleResize = () => {
            this.#updateCanvas();
        };

        #handleEscape = (e: KeyboardEvent) => {
            if (!e.repeat) {
                this.destroy();
            }
        };

        #initListeners() {
            document.addEventListener('mousemove', this.#handleMousemove, { passive: true });
            document.addEventListener('scroll', this.#handleScroll);
            document.addEventListener('mouseout', this.#handleMouseout);
            document.addEventListener('mouseover', this.#handleMouseover);
            document.addEventListener('keydown', this.#handleEscape);
            window.addEventListener('resize', this.#handleResize);
        }

        #removeListeners() {
            document.removeEventListener('mousemove', this.#handleMousemove);
            document.removeEventListener('scroll', this.#handleScroll);
            document.removeEventListener('mouseout', this.#handleMouseout);
            document.removeEventListener('mouseover', this.#handleMouseover);
            document.removeEventListener('mousedown', this.#handleMouseDown);
            document.removeEventListener('keydown', this.#handleEscape);
            window.removeEventListener('resize', this.#handleResize);
        }

        static #constructStyles() {
            const style = document.createElement('style');
            style.innerHTML = `
                    #preply-loc-element-selector {
                      display: none;
                      z-index: calc(9e999);
                      position: fixed;
                      top: 0;
                      left: 0;
                      width: 100%;
                      height: 100%;
                    }

                    #preply-loc-element-selector.enabled {
                      display: block;
                      pointer-events: all;
                    }
                  `;
            document.getElementsByTagName('head')[0].appendChild(style);

            return style;
        }

        static #constructCanvas() {
            const canvas = document.createElement('canvas');
            canvas.setAttribute('id', 'preply-loc-element-selector');

            canvas.classList.add('enabled');

            const lastChild = document.body.lastChild;
            document.body.insertBefore(canvas, lastChild);

            canvas.setAttribute('width', canvas.clientWidth.toString());
            canvas.setAttribute('height', canvas.clientHeight.toString());

            canvas.classList.remove('enabled');

            return canvas;
        }
    }

    // @ts-expect-error Data structure is unknown
    const extractTransDataFromReactFiber = (data, dom: Element) => {
        if (!data) return null;
        if (!data.type) return null;
        if (
            data.type.displayName !== 'MemoizedFormattedMessage' &&
            data.type.displayName !== 'FormattedMessage'
        ) {
            return null;
        }
        let stringId = data.memoizedProps.id;
        if (stringId.startsWith('shared-translations-id-scope.')) {
            stringId = stringId.replace('shared-translations-id-scope.', '');
        }
        return {
            id: stringId,
            defaultMessage: data.memoizedProps.defaultMessage as string | null,
            text: dom.textContent as string,
        };
    };

    const findTransPropsInReactFiber = (dom: Element) => {
        const key = Object.keys(dom).find(key => {
            return key.startsWith('__reactFiber$');
        });
        // @ts-expect-error Not sure how to fix dom[key] ts error
        const reactProps = key ? dom[key] : null;
        if (reactProps == null) return null;
        if (reactProps.child == null) return null;
        // if (reactProps.type == null) return null;

        let data = extractTransDataFromReactFiber(reactProps.child, dom);
        if (!data && reactProps.child.child) {
            data = extractTransDataFromReactFiber(reactProps.child.child, dom);
        }
        if (data) {
            return data;
        }
        return null;
    };

    // @ts-expect-error Data structure is unknown
    const extractTransDataFromReactProps = (data, dom: Element) => {
        if (!data) return null;
        if (!data.type) return null;
        if (
            data.type.displayName !== 'MemoizedFormattedMessage' &&
            data.type.displayName !== 'FormattedMessage'
        ) {
            return null;
        }
        let stringId = data.props.id;
        if (stringId.startsWith('shared-translations-id-scope.')) {
            stringId = stringId.replace('shared-translations-id-scope.', '');
        }
        return {
            id: stringId,
            defaultMessage: data.props.defaultMessage as string | null,
            text: dom.textContent as string,
        };
    };

    const findTransPropsInReactProps = (dom: Element) => {
        const key = Object.keys(dom).find(key => {
            return key.startsWith('__reactProps$');
        });
        // @ts-expect-error Not sure how to fix dom[key] ts error
        const reactProps = key ? dom[key] : null;
        if (reactProps == null) return null;
        if (reactProps.children == null) return null;

        if (Array.isArray(reactProps.children)) {
            for (const child of reactProps.children) {
                const data = extractTransDataFromReactProps(child, dom);
                if (data) {
                    return data;
                }
            }
        } else {
            const data = extractTransDataFromReactProps(reactProps.children, dom);
            if (data) {
                return data;
            }
        }
        return null;
    };

    const getDebugInfo = (dom: Element) => {
        return JSON.stringify({
            lang: document.documentElement.lang,
            dom: dom.outerHTML,
            url: window.location.href,
        });
    };

    const getTransProps = (dom: Element): DetectedLoc => {
        let props = findTransPropsInReactFiber(dom);
        if (!props && dom.parentElement) {
            props = findTransPropsInReactFiber(dom.parentElement);
        }
        if (!props) {
            props = findTransPropsInReactProps(dom);
        }
        if (!props && dom.parentElement) {
            props = findTransPropsInReactProps(dom.parentElement);
        }

        let debugInfo: string | null = null;
        if (!props) {
            props = {
                id: null,
                defaultMessage: null,
                text: dom.textContent || '',
            };
            debugInfo = getDebugInfo(dom);
        }
        return {
            id: props.id,
            defaultMessage: props.defaultMessage,
            text: props.text,
            lang: document.documentElement.lang,
            debugInfo: debugInfo,
        } as DetectedLoc;
    };

    const oldIframe = document.getElementById('preply-loc-iframe-sidebar');
    if (oldIframe) {
        oldIframe.remove();
    }

    const oldCanvas = document.getElementById('preply-loc-element-selector');
    if (oldCanvas) {
        return;
    }

    const elementSelector = new ElementSelector();
    elementSelector.togglePrompt().then(detectedLoc => {
        const mode = (window as Window & { __PREPLY_EXPERIMENT__?: boolean }).__PREPLY_EXPERIMENT__
            ? 'experiment'
            : 'identify';
        chrome.runtime.sendMessage(window.__PREPLY_LOC__, { ...(detectedLoc as DetectedLoc), _mode: mode });
        elementSelector.destroy();
    });
})();
