# koishi-plugin-subscribe-at

[![downloads](https://img.shields.io/npm/dm/koishi-plugin-subscribe-at?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-subscribe-at)
[![npm](https://img.shields.io/npm/v/koishi-plugin-subscribe-at?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-subscribe-at)

记录@你的消息。

## 使用教程

1. 在控制台左侧的插件市场选项卡中安装此插件。
2. 在插件配置选项卡中启用此插件。
3. 在你需要订阅的频道中调用 `at.subscribe` 命令，机器人就会开始记录你在此频道的@消息了
4. 调用 `at.get` 命令以查看历史@消息

## 命令

- at.subscribe：订阅此频道的@消息
- at.unsubscribe：取消订阅此频道
- at.get：获取历史@消息

## 配置项

- atDeduplication: @去重，如果关闭，在被回复的时候有可能出现两个@。

## License

使用 [MIT](./LICENSE) 许可证发布。

```
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```
