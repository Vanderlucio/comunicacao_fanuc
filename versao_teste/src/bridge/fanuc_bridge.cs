using System;
using System.IO;
using System.Text;
using System.Collections.Generic;

namespace FanucBridge
{
    class Program
    {
        private static ushort flibHandle = 0;
        private static bool isConnected = false;

        static void Main(string[] args)
        {
            Console.OutputEncoding = Encoding.UTF8;
            Console.InputEncoding = Encoding.UTF8;

            string line;
            while ((line = Console.ReadLine()) != null)
            {
                line = line.Trim();
                if (string.IsNullOrEmpty(line)) continue;
                if (line == "exit" || line == "quit") break;

                try
                {
                    ProcessCommand(line);
                }
                catch (Exception ex)
                {
                    SendJson(string.Format("{{\"success\":false,\"error\":\"{0}\"}}", EscapeJson(ex.Message)));
                }
            }

            if (isConnected && flibHandle != 0)
            {
                Focas1.cnc_freelibhndl(flibHandle);
            }
        }

        private static void ProcessCommand(string input)
        {
            Dictionary<string, string> dict = ParseSimpleJson(input);
            if (!dict.ContainsKey("cmd"))
            {
                SendJson("{\"success\":false,\"error\":\"Comando 'cmd' ausente\"}");
                return;
            }

            string cmd = dict["cmd"].ToLower();

            if (cmd == "ping")
            {
                SendJson("{\"success\":true,\"msg\":\"pong\",\"arch\":\"x86\",\"connected\":" + (isConnected ? "true" : "false") + "}");
                return;
            }

            if (cmd == "connect")
            {
                string ip = dict.ContainsKey("ip") ? dict["ip"] : "127.0.0.1";
                ushort port = dict.ContainsKey("port") ? ushort.Parse(dict["port"]) : (ushort)8193;
                int timeout = dict.ContainsKey("timeout") ? int.Parse(dict["timeout"]) : 5;

                if (isConnected && flibHandle != 0)
                {
                    Focas1.cnc_freelibhndl(flibHandle);
                    isConnected = false;
                    flibHandle = 0;
                }

                short ret = Focas1.cnc_allclibhndl3(ip, port, timeout, out flibHandle);
                if (ret == 0)
                {
                    isConnected = true;
                    SendJson(string.Format("{{\"success\":true,\"handle\":{0},\"ret\":{1},\"message\":\"Conectado com sucesso ao CNC em {2}:{3}\"}}", flibHandle, ret, ip, port));
                }
                else
                {
                    isConnected = false;
                    SendJson(string.Format("{{\"success\":false,\"ret\":{0},\"error\":\"Erro ao conectar via Fwlib32.dll (Codigo: {0})\"}}", ret));
                }
                return;
            }

            if (cmd == "disconnect")
            {
                if (isConnected && flibHandle != 0)
                {
                    Focas1.cnc_freelibhndl(flibHandle);
                }
                isConnected = false;
                flibHandle = 0;
                SendJson("{\"success\":true,\"message\":\"Desconectado\"}");
                return;
            }

            if (!isConnected || flibHandle == 0)
            {
                SendJson("{\"success\":false,\"error\":\"Nao conectado ao CNC via Fwlib32.dll\"}");
                return;
            }

            if (cmd == "read_pmc")
            {
                short typeA = dict.ContainsKey("type_a") ? short.Parse(dict["type_a"]) : (short)5; // R
                short typeD = dict.ContainsKey("type_d") ? short.Parse(dict["type_d"]) : (short)0; // Byte
                ushort start = dict.ContainsKey("start") ? ushort.Parse(dict["start"]) : (ushort)0;
                ushort count = dict.ContainsKey("count") ? ushort.Parse(dict["count"]) : (ushort)1;
                ushort end = (ushort)(start + count - 1);

                ushort elementSize = 1;
                if (typeD == 1) elementSize = 2; // Word
                else if (typeD == 2 || typeD == 3) elementSize = 4; // Long / Float

                ushort length = (ushort)(8 + (count * elementSize));

                if (typeD == 0) // Byte
                {
                    Focas1.IODBPMC0 buf = new Focas1.IODBPMC0();
                    buf.cdata = new byte[count > 5 ? count : 5];
                    short ret = Focas1.pmc_rdpmcrng(flibHandle, typeA, typeD, start, end, length, buf);
                    if (ret == 0)
                    {
                        StringBuilder sb = new StringBuilder();
                        sb.Append("[");
                        for (int i = 0; i < count; i++)
                        {
                            if (i > 0) sb.Append(",");
                            sb.Append(buf.cdata[i]);
                        }
                        sb.Append("]");
                        SendJson(string.Format("{{\"success\":true,\"ret\":0,\"type_a\":{0},\"type_d\":{1},\"start\":{2},\"count\":{3},\"values\":{4}}}", typeA, typeD, start, count, sb.ToString()));
                    }
                    else
                    {
                        SendJson(string.Format("{{\"success\":false,\"ret\":{0},\"error\":\"Erro pmc_rdpmcrng (Codigo: {0})\"}}", ret));
                    }
                }
                else if (typeD == 1) // Word
                {
                    Focas1.IODBPMC1 buf = new Focas1.IODBPMC1();
                    buf.idata = new short[count > 5 ? count : 5];
                    short ret = Focas1.pmc_rdpmcrng(flibHandle, typeA, typeD, start, end, length, buf);
                    if (ret == 0)
                    {
                        StringBuilder sb = new StringBuilder();
                        sb.Append("[");
                        for (int i = 0; i < count; i++)
                        {
                            if (i > 0) sb.Append(",");
                            sb.Append(buf.idata[i]);
                        }
                        sb.Append("]");
                        SendJson(string.Format("{{\"success\":true,\"ret\":0,\"type_a\":{0},\"type_d\":{1},\"start\":{2},\"count\":{3},\"values\":{4}}}", typeA, typeD, start, count, sb.ToString()));
                    }
                    else
                    {
                        SendJson(string.Format("{{\"success\":false,\"ret\":{0},\"error\":\"Erro pmc_rdpmcrng (Codigo: {0})\"}}", ret));
                    }
                }
                else // Long
                {
                    Focas1.IODBPMC2 buf = new Focas1.IODBPMC2();
                    buf.ldata = new int[count > 5 ? count : 5];
                    short ret = Focas1.pmc_rdpmcrng(flibHandle, typeA, typeD, start, end, length, buf);
                    if (ret == 0)
                    {
                        StringBuilder sb = new StringBuilder();
                        sb.Append("[");
                        for (int i = 0; i < count; i++)
                        {
                            if (i > 0) sb.Append(",");
                            sb.Append(buf.ldata[i]);
                        }
                        sb.Append("]");
                        SendJson(string.Format("{{\"success\":true,\"ret\":0,\"type_a\":{0},\"type_d\":{1},\"start\":{2},\"count\":{3},\"values\":{4}}}", typeA, typeD, start, count, sb.ToString()));
                    }
                    else
                    {
                        SendJson(string.Format("{{\"success\":false,\"ret\":{0},\"error\":\"Erro pmc_rdpmcrng (Codigo: {0})\"}}", ret));
                    }
                }
                return;
            }

            if (cmd == "write_pmc")
            {
                short typeA = dict.ContainsKey("type_a") ? short.Parse(dict["type_a"]) : (short)5;
                short typeD = dict.ContainsKey("type_d") ? short.Parse(dict["type_d"]) : (short)0;
                ushort start = dict.ContainsKey("start") ? ushort.Parse(dict["start"]) : (ushort)0;
                string valuesRaw = dict.ContainsKey("values") ? dict["values"] : "0";

                string[] parts = valuesRaw.Split(new char[] { ',', '[', ']' }, StringSplitOptions.RemoveEmptyEntries);
                ushort count = (ushort)parts.Length;
                ushort end = (ushort)(start + count - 1);

                ushort elementSize = (typeD == 1) ? (ushort)2 : ((typeD >= 2) ? (ushort)4 : (ushort)1);
                ushort length = (ushort)(8 + (count * elementSize));

                if (typeD == 0)
                {
                    Focas1.IODBPMC0 buf = new Focas1.IODBPMC0();
                    buf.type_a = typeA;
                    buf.type_d = typeD;
                    buf.datano_s = (short)start;
                    buf.datano_e = (short)end;
                    buf.cdata = new byte[count > 5 ? count : 5];
                    for (int i = 0; i < count; i++) buf.cdata[i] = byte.Parse(parts[i].Trim());

                    short ret = Focas1.pmc_wrpmcrng(flibHandle, length, buf);
                    SendJson(string.Format("{{\"success\":{0},\"ret\":{1},\"written\":{2}}}", (ret == 0 ? "true" : "false"), ret, count));
                }
                else if (typeD == 1)
                {
                    Focas1.IODBPMC1 buf = new Focas1.IODBPMC1();
                    buf.type_a = typeA;
                    buf.type_d = typeD;
                    buf.datano_s = (short)start;
                    buf.datano_e = (short)end;
                    buf.idata = new short[count > 5 ? count : 5];
                    for (int i = 0; i < count; i++) buf.idata[i] = short.Parse(parts[i].Trim());

                    short ret = Focas1.pmc_wrpmcrng(flibHandle, length, buf);
                    SendJson(string.Format("{{\"success\":{0},\"ret\":{1},\"written\":{2}}}", (ret == 0 ? "true" : "false"), ret, count));
                }
                else
                {
                    Focas1.IODBPMC2 buf = new Focas1.IODBPMC2();
                    buf.type_a = typeA;
                    buf.type_d = typeD;
                    buf.datano_s = (short)start;
                    buf.datano_e = (short)end;
                    buf.ldata = new int[count > 5 ? count : 5];
                    for (int i = 0; i < count; i++) buf.ldata[i] = int.Parse(parts[i].Trim());

                    short ret = Focas1.pmc_wrpmcrng(flibHandle, length, buf);
                    SendJson(string.Format("{{\"success\":{0},\"ret\":{1},\"written\":{2}}}", (ret == 0 ? "true" : "false"), ret, count));
                }
                return;
            }

            if (cmd == "read_param")
            {
                short paramNum = dict.ContainsKey("number") ? short.Parse(dict["number"]) : (short)5001;
                short axis = dict.ContainsKey("axis") ? short.Parse(dict["axis"]) : (short)0;

                Focas1.IODBPSD_1 buf = new Focas1.IODBPSD_1();
                short ret = Focas1.cnc_rdparam(flibHandle, paramNum, axis, 4 + 4, buf);
                if (ret == 0)
                {
                    SendJson(string.Format("{{\"success\":true,\"ret\":0,\"number\":{0},\"axis\":{1},\"value\":{2}}}", paramNum, axis, buf.ldata));
                }
                else
                {
                    SendJson(string.Format("{{\"success\":false,\"ret\":{0},\"error\":\"Erro cnc_rdparam #{0} (Codigo: {1})\"}}", paramNum, ret));
                }
                return;
            }

            if (cmd == "write_param")
            {
                short paramNum = dict.ContainsKey("number") ? short.Parse(dict["number"]) : (short)5001;
                short axis = dict.ContainsKey("axis") ? short.Parse(dict["axis"]) : (short)0;
                int value = dict.ContainsKey("value") ? int.Parse(dict["value"]) : 0;

                Focas1.IODBPSD_1 buf = new Focas1.IODBPSD_1();
                buf.datano = paramNum;
                buf.type = axis;
                buf.ldata = value;

                short ret = Focas1.cnc_wrparam(flibHandle, 4 + 4, buf);
                SendJson(string.Format("{{\"success\":{0},\"ret\":{1},\"number\":{2},\"axis\":{3},\"value\":{4}}}", (ret == 0 ? "true" : "false"), ret, paramNum, axis, value));
                return;
            }

            if (cmd == "read_status")
            {
                Focas1.ODBST stat = new Focas1.ODBST();
                short ret = Focas1.cnc_statinfo(flibHandle, stat);
                if (ret == 0)
                {
                    SendJson(string.Format("{{\"success\":true,\"ret\":0,\"mode\":{0},\"run\":{1},\"emergency\":{2},\"alarm\":{3}}}",
                        stat.aut, stat.run, (stat.emergency != 0 ? "true" : "false"), (stat.alarm != 0 ? "true" : "false")));
                }
                else
                {
                    SendJson(string.Format("{{\"success\":false,\"ret\":{0},\"error\":\"Erro cnc_statinfo (Codigo: {0})\"}}", ret));
                }
                return;
            }

            SendJson(string.Format("{{\"success\":false,\"error\":\"Comando desconhecido: {0}\"}}", cmd));
        }

        private static void SendJson(string json)
        {
            Console.WriteLine(json);
            Console.Out.Flush();
        }

        private static Dictionary<string, string> ParseSimpleJson(string json)
        {
            Dictionary<string, string> map = new Dictionary<string, string>();
            json = json.Trim();
            if (json.StartsWith("{")) json = json.Substring(1);
            if (json.EndsWith("}")) json = json.Substring(0, json.Length - 1);

            string[] tokens = json.Split(new char[] { ',' }, StringSplitOptions.RemoveEmptyEntries);
            foreach (string tok in tokens)
            {
                int colonIdx = tok.IndexOf(':');
                if (colonIdx > 0)
                {
                    string k = tok.Substring(0, colonIdx).Trim().Trim('\"', '\'');
                    string v = tok.Substring(colonIdx + 1).Trim().Trim('\"', '\'');
                    map[k] = v;
                }
            }
            return map;
        }

        private static string EscapeJson(string s)
        {
            if (string.IsNullOrEmpty(s)) return "";
            return s.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\n", "\\n").Replace("\r", "\\r");
        }
    }
}
