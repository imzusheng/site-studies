"""MCP 执行器：跑一个 tools 脚本，把 stdout/stderr 和完整 traceback 写进日志。

blender-mcp 的 execute_blender_code 在脚本抛异常时只回一句话，没有堆栈，
定位成本极高。这个 runner 把全部输出落盘，Mac 侧直接读日志即可。

在 MCP 里这样用：
    import sys as _s
    _s.path.insert(0, "<tools 绝对路径>")
    import _run as _r
    _r.go("01_import_gate.py")
    del _s, _r
"""

import runpy
import sys
import traceback
from pathlib import Path

HERE = Path(__file__).resolve().parent
LOG = Path("/tmp/ruth_run.log")


class _Tee:
    """同时写真实 stdout 与日志文件。Blender 的 stdout 在异常时会被吞。"""

    def __init__(self, fh):
        self._fh = fh

    def write(self, s):
        try:
            sys.__stdout__.write(s)
        except Exception:
            pass
        self._fh.write(s)

    def flush(self):
        self._fh.flush()
        try:
            sys.__stdout__.flush()
        except Exception:
            pass

    def isatty(self):
        return False


def go(name, **kwargs):
    path = HERE / name
    if not path.exists():
        return f"脚本不存在: {path}"
    try:
        sys.stdout.reconfigure(line_buffering=True)
    except Exception:
        pass
    for k, v in kwargs.items():
        __import__("os").environ[k] = str(v)
    with open(LOG, "w", buffering=1) as fh:
        old_out, old_err = sys.stdout, sys.stderr
        tee = _Tee(fh)
        sys.stdout = sys.stderr = tee
        status = "OK"
        try:
            runpy.run_path(str(path), run_name="__main__")
            print("\n[EXIT OK]")
        except BaseException as e:
            status = "FAIL"
            text = traceback.format_exc()
            if not text.strip():
                # 某些中断（如 Blender 内部触发的中止）format_exc 会返回空串，
                # 这时至少把异常类型和对象本身写出来。
                text = (f"{type(e).__name__}: {e!r}\n"
                        f"(traceback 为空，可能是非普通异常)")
            for target in (HERE.parent / "reports" / "_last_error.txt",
                           Path("/tmp/ruth_error.txt")):
                try:
                    Path(target).write_text(text)
                except Exception:
                    pass
            try:
                sys.stdout.write(text + "\n[EXIT FAIL]\n")
            except Exception:
                pass
            try:
                sys.__stdout__.write("[ruth] 脚本失败，详见 /tmp/ruth_error.txt\n")
            except Exception:
                pass
        finally:
            sys.stdout, sys.stderr = old_out, old_err
    return status