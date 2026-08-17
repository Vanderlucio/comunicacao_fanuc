using System;
using System.IO;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Globalization;

namespace FanucBridge
{
    [StructLayout(LayoutKind.Sequential, Pack = 2)]
    public class IODBPMC_CUSTOM
    {
        public short type_a;
        public short type_d;
        public short datano_s;
        public short datano_e;
        [MarshalAs(UnmanagedType.ByValArray, SizeConst = 1024)]
        public byte[] cdata = new byte[1024];
    }

    class NativeMethods
    {
        [DllImport("FWLIB32.dll", EntryPoint = "pmc_rdpmcrng")]
        public static extern short pmc_rdpmcrng_custom(ushort FlibHndl, short a, short b, ushort c, ushort d, ushort e, [Out, MarshalAs(UnmanagedType.LPStruct)] IODBPMC_CUSTOM f);

        [DllImport("FWLIB32.dll", EntryPoint = "pmc_wrpmcrng")]
        public static extern short pmc_wrpmcrng_custom(ushort FlibHndl, ushort a, [In, MarshalAs(UnmanagedType.LPStruct)] IODBPMC_CUSTOM b);
    }

    class Program
    {
        private static ushort flibHandle = 0;
        private static bool isConnected = false;

        static void Main(string[] args)
        {
            Console.OutputEncoding = Encoding.UTF8;
            Console.InputEncoding = Encoding.UTF8;

            AppDomain.CurrentDomain.ProcessExit += (s, e) =>
            {
                if (isConnected && flibHandle != 0)
                {
                    try { Focas1.cnc_freelibhndl(flibHandle); } catch { }
                }
            };

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

        private delegate short PositionFunc(ushort handle, short axis, short length, Focas1.ODBAXIS buf);

        private static string ReadCoordinates(ushort handle, PositionFunc readFunc)
        {
            double x = 0.0, y = 0.0, z = 0.0, a = 0.0;
            try
            {
                Focas1.ODBAXIS pX = new Focas1.ODBAXIS();
                if (readFunc(handle, 1, 8, pX) == 0 && pX.data != null && pX.data.Length > 0) x = pX.data[0] / 1000.0;

                Focas1.ODBAXIS pY = new Focas1.ODBAXIS();
                if (readFunc(handle, 2, 8, pY) == 0 && pY.data != null && pY.data.Length > 0) y = pY.data[0] / 1000.0;

                Focas1.ODBAXIS pZ = new Focas1.ODBAXIS();
                if (readFunc(handle, 3, 8, pZ) == 0 && pZ.data != null && pZ.data.Length > 0) z = pZ.data[0] / 1000.0;

                Focas1.ODBAXIS pA = new Focas1.ODBAXIS();
                if (readFunc(handle, 4, 8, pA) == 0 && pA.data != null && pA.data.Length > 0) a = pA.data[0] / 1000.0;
            }
            catch { }

            return "{\"X\":" + x.ToString("F3", CultureInfo.InvariantCulture) +
                   ",\"Y\":" + y.ToString("F3", CultureInfo.InvariantCulture) +
                   ",\"Z\":" + z.ToString("F3", CultureInfo.InvariantCulture) +
                   ",\"A\":" + a.ToString("F3", CultureInfo.InvariantCulture) + "}";
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

                IODBPMC_CUSTOM buf = new IODBPMC_CUSTOM();
                short ret = NativeMethods.pmc_rdpmcrng_custom(flibHandle, typeA, typeD, start, end, length, buf);

                if (ret == 0)
                {
                    StringBuilder sb = new StringBuilder();
                    sb.Append("[");

                    if (typeD == 0) // Byte
                    {
                        for (int i = 0; i < count; i++)
                        {
                            if (i > 0) sb.Append(",");
                            sb.Append(buf.cdata[i]);
                        }
                    }
                    else if (typeD == 1) // Word
                    {
                        for (int i = 0; i < count; i++)
                        {
                            if (i > 0) sb.Append(",");
                            short val = BitConverter.ToInt16(buf.cdata, i * 2);
                            sb.Append(val);
                        }
                    }
                    else if (typeD == 3) // Float
                    {
                        for (int i = 0; i < count; i++)
                        {
                            if (i > 0) sb.Append(",");
                            float val = BitConverter.ToSingle(buf.cdata, i * 4);
                            sb.Append(val.ToString(CultureInfo.InvariantCulture));
                        }
                    }
                    else // Long
                    {
                        for (int i = 0; i < count; i++)
                        {
                            if (i > 0) sb.Append(",");
                            int val = BitConverter.ToInt32(buf.cdata, i * 4);
                            sb.Append(val);
                        }
                    }

                    sb.Append("]");
                    SendJson(string.Format("{{\"success\":true,\"ret\":0,\"type_a\":{0},\"type_d\":{1},\"start\":{2},\"count\":{3},\"values\":{4}}}", typeA, typeD, start, count, sb.ToString()));
                }
                else
                {
                    string errDesc = "Erro pmc_rdpmcrng (Codigo: " + ret + ")";
                    if (ret == 3)
                    {
                        errDesc = "Endereco fora da faixa do PMC (Codigo: 3). Verifique o endereco (ex: Keep Relays vao de K0 a K19/K99).";
                    }
                    SendJson(string.Format("{{\"success\":false,\"ret\":{0},\"error\":\"{1}\"}}", ret, errDesc));
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

                IODBPMC_CUSTOM buf = new IODBPMC_CUSTOM();
                buf.type_a = typeA;
                buf.type_d = typeD;
                buf.datano_s = (short)start;
                buf.datano_e = (short)end;

                if (typeD == 0) // Byte
                {
                    for (int i = 0; i < count; i++)
                    {
                        buf.cdata[i] = byte.Parse(parts[i].Trim());
                    }
                }
                else if (typeD == 1) // Word
                {
                    for (int i = 0; i < count; i++)
                    {
                        short val = short.Parse(parts[i].Trim());
                        BitConverter.GetBytes(val).CopyTo(buf.cdata, i * 2);
                    }
                }
                else // Long
                {
                    for (int i = 0; i < count; i++)
                    {
                        int val = int.Parse(parts[i].Trim());
                        BitConverter.GetBytes(val).CopyTo(buf.cdata, i * 4);
                    }
                }

                short ret = NativeMethods.pmc_wrpmcrng_custom(flibHandle, length, buf);
                SendJson(string.Format("{{\"success\":{0},\"ret\":{1},\"written\":{2}}}", (ret == 0 ? "true" : "false"), ret, count));
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
                    double posX = 0.0, posY = 0.0, posZ = 0.0, posA = 0.0;
                    try
                    {
                        // Leitura de cada eixo individualmente (8 bytes por eixo)
                        Focas1.ODBAXIS pX = new Focas1.ODBAXIS();
                        if (Focas1.cnc_absolute(flibHandle, 1, 8, pX) == 0 && pX.data != null && pX.data.Length > 0) posX = pX.data[0] / 1000.0;

                        Focas1.ODBAXIS pY = new Focas1.ODBAXIS();
                        if (Focas1.cnc_absolute(flibHandle, 2, 8, pY) == 0 && pY.data != null && pY.data.Length > 0) posY = pY.data[0] / 1000.0;

                        Focas1.ODBAXIS pZ = new Focas1.ODBAXIS();
                        if (Focas1.cnc_absolute(flibHandle, 3, 8, pZ) == 0 && pZ.data != null && pZ.data.Length > 0) posZ = pZ.data[0] / 1000.0;

                        Focas1.ODBAXIS pA = new Focas1.ODBAXIS();
                        if (Focas1.cnc_absolute(flibHandle, 4, 8, pA) == 0 && pA.data != null && pA.data.Length > 0) posA = pA.data[0] / 1000.0;
                    }
                    catch { }

                    int feedrate = 0;
                    try
                    {
                        Focas1.ODBACT actf = new Focas1.ODBACT();
                        if (Focas1.cnc_actf(flibHandle, actf) == 0) feedrate = actf.data;
                    }
                    catch { }

                    int spindle = 0;
                    try
                    {
                        Focas1.ODBACT acts = new Focas1.ODBACT();
                        if (Focas1.cnc_acts(flibHandle, acts) == 0) spindle = acts.data;
                    }
                    catch { }

                    string prgName = "---";
                    try
                    {
                        Focas1.ODBPRO prg = new Focas1.ODBPRO();
                        if (Focas1.cnc_rdprgnum(flibHandle, prg) == 0) prgName = "O" + prg.data.ToString("D4");
                    }
                    catch { }

                    int partsCount = 0;
                    try
                    {
                        Focas1.IODBPSD_1 p6711 = new Focas1.IODBPSD_1();
                        if (Focas1.cnc_rdparam(flibHandle, 6711, 0, 8, p6711) == 0) partsCount = p6711.ldata;
                    }
                    catch { }

                    int totalParts = 0;
                    try
                    {
                        Focas1.IODBPSD_1 p6712 = new Focas1.IODBPSD_1();
                        if (Focas1.cnc_rdparam(flibHandle, 6712, 0, 8, p6712) == 0) totalParts = p6712.ldata;
                    }
                    catch { }

                    string absJson = ReadCoordinates(flibHandle, Focas1.cnc_absolute);
                    string relJson = ReadCoordinates(flibHandle, Focas1.cnc_relative);
                    string mcnJson = ReadCoordinates(flibHandle, Focas1.cnc_machine);
                    string distJson = ReadCoordinates(flibHandle, Focas1.cnc_distance);

                    string posJson = "{\"absolute\":" + absJson +
                                     ",\"relative\":" + relJson +
                                     ",\"machine\":" + mcnJson +
                                     ",\"distance\":" + distJson + "}";

                    StringBuilder sbStatus = new StringBuilder();
                    sbStatus.Append("{\"success\":true,\"ret\":0,");
                    sbStatus.Append("\"mode\":" + stat.aut + ",");
                    sbStatus.Append("\"emergency\":" + (stat.emergency != 0 ? "true" : "false") + ",");
                    sbStatus.Append("\"alarm\":" + (stat.alarm != 0 ? "true" : "false") + ",");
                    sbStatus.Append("\"feedrate\":" + feedrate + ",");
                    sbStatus.Append("\"spindleSpeed\":" + spindle + ",");
                    sbStatus.Append("\"program\":\"" + EscapeJson(prgName) + "\",");
                    sbStatus.Append("\"partsCount\":" + partsCount + ",");
                    sbStatus.Append("\"totalParts\":" + totalParts + ",");
                    sbStatus.Append("\"positions\":" + posJson + "}");

                    SendJson(sbStatus.ToString());
                }
                else
                {
                    SendJson(string.Format("{{\"success\":false,\"ret\":{0},\"error\":\"Erro cnc_statinfo (Codigo: {0})\"}}", ret));
                }
                return;
            }

            if (cmd == "read_positions" || cmd == "read_axis")
            {
                string type = dict.ContainsKey("type") ? dict["type"].ToLower() : "absolute";
                string coordsJson = "";
                if (type == "relative" || type == "rel")
                    coordsJson = ReadCoordinates(flibHandle, Focas1.cnc_relative);
                else if (type == "machine" || type == "mcn")
                    coordsJson = ReadCoordinates(flibHandle, Focas1.cnc_machine);
                else if (type == "distance" || type == "dist")
                    coordsJson = ReadCoordinates(flibHandle, Focas1.cnc_distance);
                else
                    coordsJson = ReadCoordinates(flibHandle, Focas1.cnc_absolute);

                SendJson("{\"success\":true,\"ret\":0,\"type\":\"" + type + "\",\"positions\":" + coordsJson + "}");
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
